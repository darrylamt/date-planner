import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { Group, Row } from "../src/components/List";
import { GUTTER, space } from "../src/theme";
import { useAuth, sendCode, signOut, verifyCode } from "../src/lib/useAuth";

type Phase = "email" | "code";

export default function Login() {
  const { session } = useAuth();
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Already signed in — this screen becomes the account screen. */
  if (session) {
    return (
      <Screen grouped contentStyle={{ paddingTop: space.xl }}>
        <Group header="Account" footer="Your saved plans stay on your account.">
          <Row icon="envelope.fill" title={session.user.email ?? "Signed in"} />
        </Group>
        <View style={{ paddingHorizontal: GUTTER }}>
          <Button
            title="Sign out"
            kind="gray"
            onPress={async () => {
              await signOut();
              router.back();
            }}
          />
        </View>
      </Screen>
    );
  }

  async function submitEmail() {
    if (!email.includes("@")) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await sendCode(email);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase("code");
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    const { error: err } = await verifyCode(email, code);
    setBusy(false);
    if (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("That code didn't work. Check it and try again.");
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen grouped contentStyle={{ paddingTop: space.xl }}>
        <View style={{ paddingHorizontal: GUTTER }}>
          <Text variant="title1">
            {phase === "email" ? "Sign in" : "Check your email"}
          </Text>
          <Text variant="body" tone="secondary" style={{ marginTop: space.xs, marginBottom: space.xl }}>
            {phase === "email"
              ? "No passwords. We'll email you a six-digit code."
              : `We sent a six-digit code to ${email}.`}
          </Text>

          {phase === "email" ? (
            <>
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
                returnKeyType="go"
                onSubmitEditing={submitEmail}
              />
              <Button title="Email me a code" onPress={submitEmail} loading={busy} />
            </>
          ) : (
            <>
              <Field
                label="Six-digit code"
                placeholder="123456"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                style={{ fontSize: 28, letterSpacing: 8, fontVariant: ["tabular-nums"] }}
              />
              <Button
                title="Sign in"
                onPress={submitCode}
                loading={busy}
                disabled={code.length < 6}
              />
              <Button
                title="Use a different email"
                kind="plain"
                onPress={() => {
                  setPhase("email");
                  setCode("");
                  setError(null);
                }}
                style={{ marginTop: space.md }}
              />
            </>
          )}

          {error ? (
            <Text variant="footnote" tone="red" style={{ marginTop: space.md }}>
              {error}
            </Text>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
