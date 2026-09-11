import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space, type as typeScale } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { reportVenue, type ReportType } from "../../lib/api";

/**
 * Tell us something is wrong with a venue, from the evening itself.
 *
 * The person standing outside a place that has shut, or looking at a bill that
 * does not match, is the only one who knows. That knowledge has a very short
 * life, so this asks for one tap and treats everything after it as optional:
 * a reason alone is a useful report, and demanding a note or a number before
 * accepting one would lose most of them.
 *
 * Nothing here edits the catalog. A report is a flag a person reviews, because
 * a price anyone could change from a phone is a price anyone could change to
 * anything.
 */
const REASONS: { id: ReportType; label: string; sub: string; icon: string }[] = [
  {
    id: "price",
    label: "The price is different",
    sub: "It cost more or less than we said",
    icon: "banknote",
  },
  {
    id: "closed",
    label: "Closed or not there",
    sub: "Shut down, or we sent you to nothing",
    icon: "xmark.circle",
  },
  {
    id: "phone",
    label: "The number is wrong",
    sub: "Nobody answered, or it was a stranger",
    icon: "phone.down",
  },
  {
    id: "wrong_info",
    label: "Something else is wrong",
    sub: "The name, the area, the hours",
    icon: "exclamationmark.triangle",
  },
];

export function ReportSheet({
  visible,
  onClose,
  venueId,
  venueName,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  onDone: (message: string) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  const [reason, setReason] = useState<ReportType | null>(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  function reset() {
    setReason(null);
    setPrice("");
    setNote("");
    setSending(false);
  }

  async function send() {
    if (!reason) return;
    setSending(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const digits = price.replace(/[^0-9]/g, "");
    const result = await reportVenue({
      venueId,
      reportType: reason,
      suggestedPriceGhs: reason === "price" && digits ? Number(digits) : null,
      note: note.trim() || undefined,
    });

    reset();
    onClose();

    /*
     * A duplicate is not a failure. They already told us, and saying so is
     * friendlier than a silent success that makes them wonder whether the
     * first one counted.
     */
    onDone(
      result.duplicate
        ? "You already told us about this one. Thank you."
        : result.ok
          ? "Thank you. We will check it."
          : "That did not send. Your plan is untouched."
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
            <Text variant="headline">Report an issue</Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {venueName}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: GUTTER,
            paddingBottom: insets.bottom + space.xl,
          }}
        >
          {REASONS.map((r) => {
            const on = reason === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setReason(r.id);
                }}
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
                <Symbol
                  name={r.icon as never}
                  size={22}
                  color={on ? c.accent : c.textSecondary}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="body">{r.label}</Text>
                  <Text variant="footnote" tone="secondary">
                    {r.sub}
                  </Text>
                </View>
                {on ? <Symbol name="checkmark" size={18} color={c.accent} /> : null}
              </Pressable>
            );
          })}

          {reason === "price" ? (
            <View style={{ marginTop: space.md }}>
              <Text variant="footnote" tone="secondary" style={{ marginBottom: space.xs }}>
                What did it actually cost, per person? Optional.
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: c.backgroundElement,
                  borderRadius: radius.control,
                  paddingHorizontal: space.md,
                  height: 44,
                }}
              >
                <Text variant="body" tone="secondary">
                  GHS{" "}
                </Text>
                <TextInput
                  value={price}
                  onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={c.textTertiary}
                  style={{
                    flex: 1,
                    color: c.text,
                    fontSize: typeScale.body.fontSize,
                    paddingVertical: 0,
                  }}
                />
              </View>
            </View>
          ) : null}

          {reason ? (
            <View style={{ marginTop: space.md }}>
              <Text variant="footnote" tone="secondary" style={{ marginBottom: space.xs }}>
                Anything else? Optional.
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={600}
                placeholder="What you saw"
                placeholderTextColor={c.textTertiary}
                style={{
                  backgroundColor: c.backgroundElement,
                  borderRadius: radius.control,
                  padding: space.md,
                  height: 96,
                  textAlignVertical: "top",
                  color: c.text,
                  fontSize: typeScale.body.fontSize,
                }}
              />
            </View>
          ) : null}

          <View style={{ marginTop: space.lg }}>
            <Button
              title={sending ? "Sending" : "Send report"}
              onPress={send}
              disabled={!reason || sending}
              loading={sending}
            />
          </View>

          <Text
            variant="caption1"
            tone="tertiary"
            center
            style={{ marginTop: space.md }}
          >
            Reports are read by a person before anything changes.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
