import { Platform } from "react-native";
import { supabase } from "./supabase";
import { nativeOptional } from "./nativeOptional";

/*
 * Every one of these arrived after the build currently on TestFlight, so they
 * are resolved defensively rather than imported at the top. An older binary
 * receiving this bundle gets null and hides the buttons, instead of crashing
 * the login screen on a module it has never heard of.
 */
type AppleModule = typeof import("expo-apple-authentication");
type AuthSessionModule = typeof import("expo-auth-session");
type WebBrowserModule = typeof import("expo-web-browser");
type CryptoModule = typeof import("expo-crypto");

export const AppleAuthentication = nativeOptional<AppleModule>(() =>
  require("expo-apple-authentication")
);
const AuthSession = nativeOptional<AuthSessionModule>(() => require("expo-auth-session"));
const WebBrowser = nativeOptional<WebBrowserModule>(() => require("expo-web-browser"));
const Crypto = nativeOptional<CryptoModule>(() => require("expo-crypto"));

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
WebBrowser?.maybeCompleteAuthSession();

/** False on a build that predates the auth modules, so the button can hide. */
export function googleSignInAvailable(): boolean {
  return Boolean(AuthSession && WebBrowser);
}

/*
 * What a person reads when sign-in fails: never an exception's own text.
 * "RequestUnknownException ... (at ExpoAppleAuthentication/...swift:61)" is
 * true and useless, and it read like the app breaking. The codes are kept
 * for the logs; the words say what to try.
 */
const APPLE_SAYS: Record<string, string> = {
  ERR_REQUEST_UNKNOWN:
    "Apple sign-in did not go through. Check you are signed in to iCloud in Settings, then try again, or use Google or email.",
  ERR_REQUEST_FAILED: "Apple sign-in did not work just now. Try again, or use Google or email.",
  ERR_REQUEST_NOT_HANDLED: "Apple sign-in did not work just now. Try again, or use Google or email.",
  ERR_REQUEST_NOT_INTERACTIVE: "Apple sign-in did not work just now. Try again, or use Google or email.",
  ERR_INVALID_RESPONSE: "Apple sent back something we could not use. Try again, or use Google or email.",
};
const FINISH_FAILED = "We could not finish signing you in. Check your connection and try again.";
// No Apple button on Android, so no pointing at one.
const GOOGLE_FAILED = `Google sign-in did not work just now. Try again, or use ${Platform.OS === "ios" ? "Apple or email" : "email"}.`;

export interface SocialResult {
  ok: boolean;
  /** Set when the person backed out. Not an error worth showing. */
  cancelled?: boolean;
  error?: string;
}

/** True only when the module is present and the hardware supports it. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios" || !AppleAuthentication) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<SocialResult> {
  if (!AppleAuthentication || !Crypto) {
    return { ok: false, error: "Update the app to sign in with Apple." };
  }
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
      return { ok: false, error: APPLE_SAYS.ERR_INVALID_RESPONSE };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) {
      console.warn("apple sign-in: supabase", error.message);
      return { ok: false, error: FINISH_FAILED };
    }

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
          // Apple sends the name exactly once, on first authorisation, and
          // never again, so a silent policy miss here loses it for good.
          .update({ display_name: full })
          .eq("id", user.id)
          .is("display_name", null);
      }
    }

    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "ERR_REQUEST_CANCELED") return { ok: false, cancelled: true };
    console.warn("apple sign-in", err.code, err.message);
    return { ok: false, error: (err.code && APPLE_SAYS[err.code]) || APPLE_SAYS.ERR_REQUEST_FAILED };
  }
}

/**
 * Which app shows Google's sign-in page on Android.
 *
 * Left to itself, Android hands the page to any app that offers an in-app
 * browser tab, and Outlook offers one: on a phone without a default browser
 * set, signing in with Google opened Outlook. So: the phone's default browser,
 * then Chrome, then any real browser that is not a mail app.
 */
async function signInBrowser(): Promise<string | undefined> {
  try {
    const b = await WebBrowser!.getCustomTabsSupportingBrowsersAsync();
    const all = b.browserPackages ?? [];
    const notMail = (p?: string | null) => Boolean(p) && !/outlook|office|gmail|mail/i.test(p!);
    if (notMail(b.defaultBrowserPackage) && all.includes(b.defaultBrowserPackage!)) return b.defaultBrowserPackage!;
    if (all.includes("com.android.chrome")) return "com.android.chrome";
    if (notMail(b.preferredBrowserPackage)) return b.preferredBrowserPackage!;
    return all.find((p) => notMail(p));
  } catch {
    return undefined;
  }
}

/*
 * Android signs in with PKCE (security audit, Oct 2026). A custom scheme like
 * aduro:// can be claimed by another app on Android, and the old flow put the
 * session itself in the address it came back on. Now the address carries only
 * a one-time code, worth nothing without the secret this phone kept, which is
 * swapped for the session directly with Supabase. iOS hands the address back
 * to the app that asked (ASWebAuthenticationSession) and keeps the old flow.
 */
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function pkcePair(): Promise<{ verifier: string; challenge: string } | null> {
  if (!Crypto || !SUPABASE_URL || !ANON_KEY) return null;
  try {
    const verifier = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    });
    return { verifier, challenge: digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
  } catch {
    return null;
  }
}

/** The one-time code and this phone's secret, for the session. */
async function sessionFromCode(code: string, verifier: string): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    const body = (await res.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
    if (!res.ok || !body.access_token || !body.refresh_token) {
      console.warn("google sign-in: code", res.status, body.error_description);
      return null;
    }
    return { access_token: body.access_token, refresh_token: body.refresh_token };
  } catch (e) {
    console.warn("google sign-in: code", (e as Error).message);
    return null;
  }
}

export async function signInWithGoogle(): Promise<SocialResult> {
  if (!AuthSession || !WebBrowser) {
    return { ok: false, error: "Update the app to sign in with Google." };
  }
  const redirectTo = AuthSession.makeRedirectUri({ scheme: "aduro", path: "auth" });

  try {
    const pkce = Platform.OS === "android" ? await pkcePair() : null;
    let start: string | undefined;
    if (pkce) {
      start =
        `${SUPABASE_URL}/auth/v1/authorize?provider=google` +
        `&redirect_to=${encodeURIComponent(redirectTo)}` +
        `&code_challenge=${pkce.challenge}&code_challenge_method=s256`;
    } else {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // Without this the SDK tries to navigate the page itself, which does
          // nothing in a native app and leaves the caller waiting forever.
          skipBrowserRedirect: true,
        },
      });
      if (error || !data?.url) {
        console.warn("google sign-in: start", error?.message);
        return { ok: false, error: GOOGLE_FAILED };
      }
      start = data.url;
    }

    const result = await WebBrowser.openAuthSessionAsync(
      start,
      redirectTo,
      Platform.OS === "android" ? { browserPackage: await signInBrowser() } : undefined
    );
    if (result.type === "cancel" || result.type === "dismiss") {
      return { ok: false, cancelled: true };
    }
    if (result.type !== "success") {
      return { ok: false, error: GOOGLE_FAILED };
    }

    /*
     * With PKCE the address brings a code to swap; otherwise Supabase returns
     * the session in the URL fragment. Either is set by hand because there is
     * no browser here to do it.
     */
    const query = new URLSearchParams(result.url.split("#")[0].split("?")[1] ?? "");
    const code = query.get("code");
    const swapped = pkce && code ? await sessionFromCode(code, pkce.verifier) : null;
    if (pkce && code && !swapped) return { ok: false, error: GOOGLE_FAILED };
    const params = new URLSearchParams(result.url.split("#")[1] ?? "");
    const access_token = swapped?.access_token ?? params.get("access_token");
    const refresh_token = swapped?.refresh_token ?? params.get("refresh_token");

    if (!access_token || !refresh_token) {
      console.warn("google sign-in: no session", params.get("error_description"));
      return { ok: false, error: GOOGLE_FAILED };
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sessionError) {
      console.warn("google sign-in: session", sessionError.message);
      return { ok: false, error: FINISH_FAILED };
    }

    return { ok: true };
  } catch (e) {
    console.warn("google sign-in", (e as Error).message);
    return { ok: false, error: GOOGLE_FAILED };
  }
}
