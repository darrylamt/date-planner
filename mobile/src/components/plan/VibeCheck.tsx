import { useState } from "react";
import { TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Button } from "../Button";
import { HAIRLINE, radius, space, type as typeScale } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { sendVibeFeedback } from "../../lib/api";
import type { Itinerary, PlanInputs } from "../../lib/types";

/**
 * "Does this feel Romantic?", under a freshly generated plan.
 *
 * People said the vibe they picked was not the vibe they got, and nothing
 * recorded it. One tap is the answer; the box after it is optional, because
 * asking for words first would lose most of the answers.
 *
 * Keyed by the caller on the plan's stops, so a new plan or a swapped stop
 * asks again rather than carrying an old answer onto a different evening.
 */
export function VibeCheck({ inputs, itinerary }: { inputs: PlanInputs; itinerary: Itinerary }) {
  const c = useTheme();
  const [planKey] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const [fits, setFits] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  const vibes = inputs.vibes ?? [];
  if (!vibes.length) return null;

  const named = vibes.length === 1 ? vibes[0] : `${vibes.slice(0, -1).join(", ")} and ${vibes[vibes.length - 1]}`;
  const send = (answer: boolean, why?: string) =>
    sendVibeFeedback({
      planKey,
      vibes,
      occasion: inputs.occasion,
      venueIds: itinerary.stops.map((s) => s.venue_id).filter((id): id is string => Boolean(id)),
      fits: answer,
      reason: why?.trim() || undefined,
    });

  const answer = (yes: boolean) => {
    void Haptics.selectionAsync();
    setFits(yes);
    setSent(false);
    void send(yes);
  };

  return (
    <View
      style={{
        marginTop: space.xl,
        padding: space.lg,
        borderRadius: radius.card,
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
        gap: space.md,
      }}
    >
      <Text variant="headline">Does this feel {named.toLowerCase()}?</Text>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Yes" kind={fits === true ? "filled" : "gray"} onPress={() => answer(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Not really" kind={fits === false ? "filled" : "gray"} onPress={() => answer(false)} />
        </View>
      </View>

      {fits !== null ? (
        sent ? (
          <Text variant="subheadline" tone="secondary">
            Thanks. That helps us get the next one right.
          </Text>
        ) : (
          <View style={{ gap: space.sm }}>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={fits ? "What made it feel right? (optional)" : "What felt off? (optional)"}
              placeholderTextColor={c.textTertiary}
              multiline
              maxLength={500}
              style={{
                minHeight: 72,
                padding: space.md,
                borderRadius: radius.control,
                backgroundColor: c.backgroundSunken,
                color: c.text,
                fontSize: typeScale.body.fontSize,
                textAlignVertical: "top",
              }}
            />
            {reason.trim() ? (
              <Button
                title="Send"
                kind="tinted"
                onPress={() => {
                  void send(fits, reason);
                  setSent(true);
                }}
              />
            ) : (
              <Text variant="caption1" tone="tertiary">
                Your answer is saved. Add a line if you like.
              </Text>
            )}
          </View>
        )
      ) : null}
    </View>
  );
}
