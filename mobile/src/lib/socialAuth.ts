import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";

/**
 * Sign in with Apple and with Google.
 *
 * Both hand Supabase an identity token rather than opening a hosted login
 * page and waiting for a redirect. The token route keeps the whole thing
 * inside the app, which is what Apple expects, and avoids the class of bug
 * where a deep link comes back to a screen that has been unmounted.
 *
 * Apple is not optional once Google exists. App Store guideline 4.8 requires
 * Sign in with Apple wherever a third-party login is offered, so shipping
 * Google alone would be a rejection rather than a smaller feature.
 */
WebBrowser.maybeCompleteAuthSession();

export interface SocialResult {
  ok: boolean;
  /** Set when the person backed out. Not an error worth showing. */
  cancelled?: boolean;
  error?: string;
}

/** Apple only exists on Apple hardware, and only iOS 13 and later. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<SocialResult> {
  try {
    /*
     * The nonce is sent hashed to Apple and raw to Supabase, which is what
     * binds the token to this request. Skipping it would let a token captured
     * elsewhere be replayed here.
     */
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { ok: false, error: "Apple did not return a sign-in token." };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return { ok: false, error: error.message };

    /*
     * Apple sends the name exactly once, on the very first authorisation, and
     * never again. Not storing it now means it is gone for good, so it is
     * written straight through rather than waiting for the profile screen.
     */
    const given = credential.fullName?.givenName?.trim();
    const family = credential.fullName?.familyName?.trim();
    const full = [given, family].filter(Boolean).join(" ");
    if (full) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ display_name: full })
          .eq("id", user.id)
          .is("display_name", null);
      }
    }

    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "ERR_REQUEST_CANCELED") return { ok: false, cancelled: true };
    return { ok: false, error: err.message ?? "Apple sign-in failed." };
  }
}

export async function signInWithGoogle(): Promise<SocialResult> {
  const redirectTo = AuthSession.makeRedirectUri({ scheme: "aduro", path: "auth" });

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Without this the SDK tries to navigate the page itself, which does
        // nothing in a native app and leaves the caller waiting forever.
        skipBrowserRedirect: true,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.url) return { ok: false, error: "Google sign-in is not configured." };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "cancel" || result.type === "dismiss") {
      return { ok: false, cancelled: true };
    }
    if (result.type !== "success") {
      return { ok: false, error: "Google sign-in did not complete." };
    }

    /*
     * Supabase returns the session in the URL fragment. It has to be parsed
     * out and set by hand because there is no browser here to do it.
     */
    const params = new URLSearchParams(result.url.split("#")[1] ?? "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (!access_token || !refresh_token) {
      const described = params.get("error_description");
      return { ok: false, error: described ?? "Google did not return a session." };
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sessionError) return { ok: false, error: sessionError.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Google sign-in failed." };
  }
}
