import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { Button } from "./Button";
import { GUTTER, space } from "../theme";
import { useTheme } from "../lib/useTheme";

/**
 * Asking before anything is sent to a third-party AI.
 *
 * Guideline 5.1.2(i) wants two things: that it is clear where the data goes,
 * and that permission is explicit. So the sheet names the company, says what
 * is sent and what is not, and has an Allow button rather than treating a
 * tap on "Continue" as consent.
 *
 * Declining a plan description costs nothing but prose -- the plan itself is
 * built by our own code and never needed the model -- so "Not now" still
 * produces a plan. Declining for the assistant means not sending, because the
 * assistant is the model.
 */
export type ConsentPurpose = "plan" | "chat";

export function AiConsentSheet({
  purpose,
  onAnswer,
}: {
  /** Null hides the sheet. */
  purpose: ConsentPurpose | null;
  onAnswer: (allowed: boolean) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  const what =
    purpose === "chat"
      ? "The assistant is powered by Claude, an AI model made by Anthropic. What you type to it is sent to Anthropic so it can answer."
      : "aduro can use Claude, an AI model made by Anthropic, to write your plan's description. To do that, your answers are sent to Anthropic, including any names or preferences you gave us.";

  return (
    <Modal visible={purpose !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onAnswer(false)}>
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          paddingHorizontal: GUTTER,
          paddingTop: space.xxl,
          paddingBottom: insets.bottom + space.lg,
        }}
      >
        <Symbol name="sparkles" size={34} color={c.accent} />
        <Text variant="title2" style={{ marginTop: space.md }}>
          Use AI for this?
        </Text>

        <Text variant="body" style={{ marginTop: space.md }}>
          {what}
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: space.md }}>
          Your email and account details are not sent. Anthropic&apos;s commercial terms do not
          allow it to use this to train its models.
        </Text>
        {purpose === "plan" ? (
          <Text variant="body" tone="secondary" style={{ marginTop: space.md }}>
            If you say no, you still get the same plan, with a plainer description.
          </Text>
        ) : null}
        <Text variant="footnote" tone="tertiary" style={{ marginTop: space.md }}>
          You can change this any time under You.
        </Text>

        <View style={{ flex: 1 }} />

        <Button title="Allow" onPress={() => onAnswer(true)} />
        <Pressable onPress={() => onAnswer(false)} style={{ marginTop: space.md, paddingVertical: space.sm }}>
          <Text variant="body" center style={{ color: c.accent }}>
            Not now
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
