import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { Segmented } from "../src/components/Segmented";
import { Symbol } from "../src/components/Symbol";
import { FloatingMascots } from "../src/components/FloatingMascots";
import { GUTTER, radius, space } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
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
 * Two halves: the cast of mascots drifting above, and a rounded sheet below
 * carrying everything you can actually press. The old screen opened on a
 * segmented control and two empty text boxes, which is what a form looks like,
 * not what an evening out looks like, and almost nobody was going to type an
 * address anyway when Apple and Google are right there.
 */
export default function Login() {
  const c = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const [social, setSocial] = useState<"apple" | "google" | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [hero, setHero] = useState({ width: 0, height: 0 });

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

  const socialButton = (
    provider: "apple" | "google",
    label: string,
    glyph: React.ReactNode
  ) => (
    <Pressable
      onPress={() => void social_(provider)}
      disabled={social !== null}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 54,
        height: 54,
        borderRadius: radius.control,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.backgroundElement,
        opacity: social !== null && social !== provider ? 0.5 : 1,
      }}
    >
      {social === provider ? <ActivityIndicator color={c.text} /> : glyph}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── the cast, drifting ── */}
      <View
        style={{ flex: 1, minHeight: 140 }}
        onLayout={(e) => setHero(e.nativeEvent.layout)}
      >
        <FloatingMascots width={hero.width} height={hero.height} />
      </View>

      {/* ── the sheet ── */}
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          backgroundColor: c.backgroundSunken,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          paddingHorizontal: GUTTER,
          paddingTop: space.xl,
          paddingBottom: Math.max(insets.bottom, space.lg) + space.md,
        }}
        keyboardShouldPersistTaps="handled"
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
        <Text variant="body" tone="secondary" style={{ marginTop: space.sm }}>
          {mode === "signin"
            ? "Sign in to save plans, share them, and keep the calendar."
            : "An account is only needed to save and share plans."}
        </Text>

        {error ? (
          <Text variant="footnote" tone="red" style={{ marginTop: space.md }}>
            {error}
          </Text>
        ) : null}

        {notice ? (
          <View
            style={{
              marginTop: space.md,
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

        {/* ── one row: the two providers, then the action ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            marginTop: space.xl,
          }}
        >
          {/*
            Apple and Google as identical squares. Guideline 4.8 wants Apple's
            option no less prominent than any other third-party sign-in, and
            two buttons of the same size satisfy that plainly.
          */}
          {appleReady && AppleAuthentication
            ? socialButton(
                "apple",
                "Continue with Apple",
                <Symbol name="apple.logo" size={26} color={c.text} />
              )
            : null}

          {googleSignInAvailable()
            ? socialButton(
                "google",
                "Continue with Google",
                <Text variant="title3" style={{ color: c.text }}>
                  G
                </Text>
              )
            : null}

          <View style={{ flex: 1 }}>
            <Button
              title={
                showEmail
                  ? mode === "signin"
                    ? "Sign in"
                    : "Create account"
                  : "Continue with email"
              }
              loading={busy}
              disabled={
                showEmail &&
                (!email || password.length < (mode === "signup" ? MIN_PASSWORD : 1))
              }
              onPress={() => {
                if (!showEmail) {
                  setEmailOpen(true);
                  return;
                }
                void submit();
              }}
            />
          </View>
        </View>

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
              placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : "••••••••"}
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

            {mode === "signin" ? (
              <Pressable onPress={forgot} disabled={busy} style={{ marginTop: space.sm }}>
                <Text variant="footnote" tone="tint" weight="600" center>
                  Forgot your password?
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
