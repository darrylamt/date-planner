import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { Segmented } from "../src/components/Segmented";
import { Image } from "expo-image";
import { Symbol } from "../src/components/Symbol";
import { BrandMark } from "../src/components/BrandMark";
import { GUTTER, HAIRLINE, radius, space } from "../src/theme";
import { useIsDark, useTheme } from "../src/lib/useTheme";
import {
  MIN_PASSWORD,
  sendPasswordReset,
  signIn,
  signUp,
  useAuth,
} from "../src/lib/useAuth";
import {
  AppleAuthentication,
  appleSignInAvailable,
  googleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from "../src/lib/socialAuth";

type Mode = "signin" | "signup";

/**
 * Sign in.
 *
 * One column on a flat page: a sentence, a character, and a stack of
 * full-width pills, each the same shape so no one of them reads as the
 * default. It replaced a drifting cast of mascots over a raised sheet, which
 * was two competing surfaces on a screen with one job.
 *
 * Every way in is a row of the same size. That is a design decision with a
 * rule behind it -- guideline 4.8 asks that Apple's option be no less
 * prominent than any other third-party sign-in -- and equal rows satisfy it
 * without anybody having to argue about which button looks bigger.
 *
 * There is no Facebook row. The reference this was drawn from has one; we do
 * not have the provider, and a button that cannot sign anybody in is worse
 * than a shorter list.
 */
export default function Login() {
  const c = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const [social, setSocial] = useState<"apple" | "google" | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void appleSignInAvailable().then((ok) => active && setAppleReady(ok));
    return () => {
      active = false;
    };
  }, []);

  /**
   * Both providers land here.
   *
   * A cancel is silent: someone who backed out of Apple's sheet knows they
   * backed out, and an error under the buttons would read as a fault.
   */
  async function social_(provider: "apple" | "google") {
    setSocial(provider);
    setError(null);
    setNotice(null);

    const result =
      provider === "apple" ? await signInWithApple() : await signInWithGoogle();

    setSocial(null);
    if (result.ok) {
      router.back();
      return;
    }
    if (!result.cancelled) setError(result.error ?? "That did not work.");
  }

  /* Signing in dismisses this modal; the account lives on the You tab. */
  useEffect(() => {
    if (session) router.back();
  }, [session]);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function submit() {
    if (!email.includes("@")) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    const outcome =
      mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

    if (outcome.error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(outcome.error);
      return;
    }

    if (outcome.needsConfirmation) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice(
        `Almost there, confirm your address using the link we sent to ${email.trim()}, then sign in.`
      );
      setMode("signin");
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // The session listener above dismisses the modal.
  }

  async function forgot() {
    if (!email.includes("@")) {
      setError("Enter your email address first, then tap this again.");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await sendPasswordReset(email);
    setBusy(false);

    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    setNotice(
      `If an account exists for ${email.trim()}, a reset link is on its way. Open it on this phone, set a password, then come back and sign in.`
    );
  }

  /*
   * Email is behind a tap, unless it is the only way in.
   *
   * Almost everyone here will use Apple or Google, and two empty text boxes at
   * the top of the first screen makes an app feel like paperwork. On a build
   * with neither provider available the form is shown outright, because a
   * screen whose only button reveals another button is a screen with no way in.
   */
  const hasProvider = appleReady || googleSignInAvailable();
  const showEmail = emailOpen || !hasProvider;

  /**
   * One row, the shape every other row is.
   *
   * Outlined rather than filled, so that nothing in the stack is styled as
   * the recommended choice: the person picks the account they already have,
   * and an app with an opinion about that is an app adding a step.
   */
  const Pill = ({
    label,
    icon,
    onPress,
    loading,
    disabled,
  }: {
    label: string;
    icon?: React.ReactNode;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        height: 56,
        borderRadius: 28,
        borderWidth: HAIRLINE,
        borderColor: c.border,
        backgroundColor: pressed ? c.backgroundSelected : c.backgroundElement,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
        marginTop: space.sm,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={c.text} />
      ) : (
        <>
          {/*
            The mark sits at the edge and the label stays centred on the row
            rather than beside the mark, so three rows with marks of different
            widths still read as one stack.
          */}
          {icon ? <View style={{ position: "absolute", left: space.lg }}>{icon}</View> : null}
          <Text variant="headline" weight="600">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/*
        Dismiss, where there is something to go back to.

        Sign-in is reached two ways: chosen from Profile, and arrived at
        because something required an account. Only the first has anywhere to
        return to, so the control is hidden rather than dead in the second.
      */}
      {router.canGoBack() ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            position: "absolute",
            top: insets.top + space.sm,
            right: GUTTER,
            zIndex: 2,
          }}
        >
          <Symbol name="xmark" size={20} color={c.textSecondary} />
        </Pressable>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: insets.top + space.xxl,
          paddingBottom: Math.max(insets.bottom, space.lg) + space.lg,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
      >
        {/*
          Two-tone, so the sentence has a subject. The grey half is the setup
          and the solid half is the promise, which is the only part anyone
          reads before deciding whether to bother.
        */}
        <Text variant="title1" style={{ color: c.textSecondary }}>
          Plan a night{" "}
          <Text variant="title1" style={{ color: c.text }}>
            worth turning up for
          </Text>
        </Text>

        {/*
          One character, not the drifting cast.

          The cast was decoration behind a form. Here it is the middle of the
          screen and the only thing between the sentence and the buttons, so a
          crowd reads as clutter where one of them reads as a mascot. It gives
          up its height first when the keyboard is open.
        */}
        <View
          style={{
            flexShrink: 1,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center",
            marginVertical: space.lg,
          }}
        >
          <Image
            source={require("../assets/mascots/date_night.png")}
            style={{ width: 168, height: 168 }}
            contentFit="contain"
            transition={200}
          />
        </View>

        {error ? (
          <Text variant="footnote" tone="red" style={{ marginBottom: space.sm }}>
            {error}
          </Text>
        ) : null}

        {notice ? (
          <View
            style={{
              marginBottom: space.sm,
              padding: space.md,
              borderRadius: radius.control,
              backgroundColor: c.accentSoft,
            }}
          >
            <Text variant="footnote" style={{ color: c.accent }}>
              {notice}
            </Text>
          </View>
        ) : null}

        {/* ── the stack: email, Apple, Google, each the same 56pt pill ── */}
        {showEmail ? null : (
          <Pill
            label="Continue with email address"
            icon={<Symbol name="envelope.fill" size={18} color={c.textSecondary} />}
            onPress={() => setEmailOpen(true)}
          />
        )}

        {/*
          ── Apple, in Apple's own button ──

          Not a pill of ours with their logo in it. Apple ships this component
          and the styles it may wear, and a custom one is a thing a reviewer
          can reasonably object to on a screen whose entire job is to be
          trusted. Theirs also carries the wordmark, tracks the system theme
          and localises itself.

          WHITE_OUTLINE at the same radius and height as the rest, so it sits
          in the stack as one of the rows rather than as an exception to it.
        */}
        {appleReady && AppleAuthentication ? (
          <View style={{ marginTop: space.sm }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                mode === "signin"
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
              }
              buttonStyle={
                isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
              }
              cornerRadius={28}
              style={{ height: 56, width: "100%" }}
              onPress={() => void social_("apple")}
            />
          </View>
        ) : null}

        {googleSignInAvailable() ? (
          <Pill
            label="Continue with Google"
            icon={<BrandMark provider="google" />}
            onPress={() => void social_("google")}
            loading={social === "google"}
            disabled={social !== null && social !== "google"}
          />
        ) : null}

        {showEmail ? (
          <View style={{ marginTop: space.lg }}>
            <Segmented
              options={[
                { value: "signin", label: "Sign in" },
                { value: "signup", label: "Create account" },
              ]}
              value={mode}
              onChange={switchMode}
            />

            <Field
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoFocus
            />

            <Field
              label="Password"
              placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : "********"}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              // Lets iOS offer Keychain autofill and, on signup, a strong password.
              textContentType={mode === "signup" ? "newPassword" : "password"}
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            <View style={{ marginTop: space.md }}>
              <Button
                title={mode === "signin" ? "Sign in" : "Create account"}
                loading={busy}
                disabled={!email || password.length < (mode === "signup" ? MIN_PASSWORD : 1)}
                onPress={submit}
              />
            </View>

            {mode === "signin" ? (
              <Pressable onPress={forgot} disabled={busy} style={{ marginTop: space.md }}>
                <Text variant="footnote" tone="tint" weight="600" center>
                  Forgot your password?
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          /*
            The underlined way back in, for somebody who already has an account
            and is looking for what is in it rather than for a way to make
            another one.
          */
          <Pressable
            onPress={() => {
              setMode("signin");
              setEmailOpen(true);
            }}
            style={{ marginTop: space.lg, alignSelf: "center" }}
          >
            <Text
              variant="footnote"
              tone="secondary"
              style={{ textDecorationLine: "underline" }}
            >
              Find my saved plans
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
