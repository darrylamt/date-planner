import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { Segmented } from "../src/components/Segmented";
import { GUTTER, radius, space } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import {
  MIN_PASSWORD,
  sendPasswordReset,
  signIn,
  signUp,
  useAuth,
} from "../src/lib/useAuth";

type Mode = "signin" | "signup";

export default function Login() {
  const c = useTheme();
  const { session } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

    const outcome = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

    if (outcome.error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(outcome.error);
      return;
    }

    if (outcome.needsConfirmation) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice(
        `Almost there — confirm your address using the link we sent to ${email.trim()}, then sign in.`
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen grouped contentStyle={{ paddingTop: space.xl }}>
        <View style={{ paddingHorizontal: GUTTER }}>
          <Segmented
            options={[
              { value: "signin", label: "Sign in" },
              { value: "signup", label: "Create account" },
            ]}
            value={mode}
            onChange={switchMode}
          />

          <Text variant="body" tone="secondary" style={{ marginBottom: space.xl }}>
            {mode === "signin"
              ? "Welcome back."
              : "You only need an account to save and share plans."}
          </Text>

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

          <Button
            title={mode === "signin" ? "Sign in" : "Create account"}
            onPress={submit}
            loading={busy}
            disabled={!email || password.length < (mode === "signup" ? MIN_PASSWORD : 1)}
          />

          {mode === "signin" ? (
            <Pressable onPress={forgot} disabled={busy} style={{ marginTop: space.lg }}>
              <Text variant="footnote" tone="tint" weight="600" center>
                Forgot your password?
              </Text>
            </Pressable>
          ) : null}

          {notice ? (
            <View
              style={{
                marginTop: space.lg,
                padding: space.md,
                borderRadius: radius.control,
                backgroundColor: c.tintMuted,
              }}
            >
              <Text variant="footnote" style={{ color: c.tint }}>
                {notice}
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text variant="footnote" tone="red" style={{ marginTop: space.lg }}>
              {error}
            </Text>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
