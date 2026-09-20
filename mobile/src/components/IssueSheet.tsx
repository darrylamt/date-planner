import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { Button } from "./Button";
import { GUTTER, HAIRLINE, radius, space, type as typeScale } from "../theme";
import { useTheme } from "../lib/useTheme";
import { reportIssue, type IssueArea } from "../lib/api";

/**
 * Tell us aduro is broken.
 *
 * Its sibling, plan/ReportSheet, reports a venue: the price moved, the door
 * was locked. This reports the app, which had nowhere to go until now. Chat
 * spent an unknown stretch telling paying subscribers they were out of
 * messages for the month, and it surfaced only because the person who runs
 * aduro ran into it himself. Everyone else who hit it had a screen that said
 * no and no way to argue with it.
 *
 * Two deliberate differences from the venue sheet. The message is required
 * rather than optional, because "chat" alone routes nothing -- with a venue
 * the reason IS the report, here the sentence is. And the area picker defaults
 * to wherever they tapped from, so the common path is type and send.
 */
const AREAS: { id: IssueArea; label: string; sub: string; icon: string }[] = [
  {
    id: "chat",
    label: "The assistant",
    sub: "Wrong answers, errors, or it stopped replying",
    icon: "bubble.left.and.bubble.right",
  },
  {
    id: "plan",
    label: "Planning",
    sub: "The questionnaire, a plan, or what was in it",
    icon: "calendar",
  },
  {
    id: "account",
    label: "Signing in",
    sub: "Login, the code email, or your details",
    icon: "person.crop.circle",
  },
  {
    id: "payment",
    label: "Paying",
    sub: "Subscribing, restoring, or being charged wrong",
    icon: "creditcard",
  },
  { id: "other", label: "Something else", sub: "Anything that does not fit", icon: "ellipsis.circle" },
];

export function IssueSheet({
  visible,
  onClose,
  onDone,
  area: initialArea = "other",
  context,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Where they tapped from. Saves a tap, and is usually right. */
  area?: IssueArea;
  /**
   * What the app knew at the moment they tapped. Gathered rather than typed:
   * a person describing a bug should not also have to be its reporter of
   * record, and a conversation id is the difference between "chat is broken"
   * and something that can be replayed.
   */
  context?: { conversationId?: string; planId?: string; lastError?: string; screen?: string };
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  const [area, setArea] = useState<IssueArea>(initialArea);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Reopening from somewhere else should land on that somewhere, not on
  // whatever was picked the last time the sheet was open.
  useEffect(() => {
    if (visible) setArea(initialArea);
  }, [visible, initialArea]);

  async function send() {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await reportIssue({
      area,
      message: text,
      context: {
        ...context,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? undefined,
        buildNumber:
          Platform.OS === "ios"
            ? (Constants.expoConfig?.ios?.buildNumber ?? undefined)
            : (String(Constants.expoConfig?.android?.versionCode ?? "") || undefined),
      },
    });

    setMessage("");
    setSending(false);
    onClose();

    /*
     * A failure still thanks them, quietly, and says what happened. They were
     * most likely sent here by something already going wrong, and an error on
     * top of an error is how a report becomes a deleted app.
     */
    onDone(
      result.ok
        ? "Thank you. A person reads these."
        : "That did not send. Worth trying again when you have signal."
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: GUTTER,
            paddingVertical: space.md,
            borderBottomWidth: HAIRLINE,
            borderBottomColor: c.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="headline">Report a problem</Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              Something in aduro, not a venue
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={8}
        >
          <ScrollView
            contentContainerStyle={{ padding: GUTTER, paddingBottom: insets.bottom + space.xl }}
            keyboardShouldPersistTaps="handled"
          >
            <Text variant="footnote" tone="secondary" style={{ marginBottom: space.sm }}>
              What went wrong?
            </Text>

            {AREAS.map((a) => {
              const on = area === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setArea(a.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    padding: space.md,
                    marginBottom: space.sm,
                    borderRadius: radius.control,
                    backgroundColor: on ? c.backgroundSelected : c.backgroundElement,
                    borderWidth: on ? 1.5 : HAIRLINE,
                    borderColor: on ? c.accent : c.border,
                  }}
                >
                  <Symbol name={a.icon as never} size={22} color={on ? c.accent : c.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{a.label}</Text>
                    <Text variant="footnote" tone="secondary">
                      {a.sub}
                    </Text>
                  </View>
                  {on ? <Symbol name="checkmark" size={18} color={c.accent} /> : null}
                </Pressable>
              );
            })}

            <View style={{ marginTop: space.md }}>
              <Text variant="footnote" tone="secondary" style={{ marginBottom: space.xs }}>
                What happened? In your own words.
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={2000}
                autoFocus={false}
                placeholder="What you did, and what the app did instead"
                placeholderTextColor={c.textTertiary}
                style={{
                  backgroundColor: c.backgroundElement,
                  borderRadius: radius.control,
                  padding: space.md,
                  height: 140,
                  textAlignVertical: "top",
                  color: c.text,
                  fontSize: typeScale.body.fontSize,
                }}
              />
            </View>

            {context?.lastError ? (
              <View
                style={{
                  marginTop: space.md,
                  padding: space.md,
                  borderRadius: radius.control,
                  backgroundColor: c.backgroundElement,
                }}
              >
                <Text variant="caption1" tone="tertiary" style={{ marginBottom: 2 }}>
                  Sent with your report
                </Text>
                <Text variant="footnote" tone="secondary">
                  {context.lastError}
                </Text>
              </View>
            ) : null}

            <View style={{ marginTop: space.lg }}>
              <Button
                title={sending ? "Sending" : "Send report"}
                onPress={send}
                disabled={!message.trim() || sending}
                loading={sending}
              />
            </View>

            <Text variant="caption1" tone="tertiary" center style={{ marginTop: space.md }}>
              We send the screen you were on and your app version so we can find it. Nothing you
              typed into a plan.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
