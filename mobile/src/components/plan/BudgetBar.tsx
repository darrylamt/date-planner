import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";
import type { PriceConfidence } from "../../lib/types";

/**
 * Budget meter: the total, where it stands against the budget, and a bar
 * that fills proportionally. The small print (the split between food and
 * transport, which stops are estimated, taxes, the planner's own note on
 * the budget) is behind the info button: true and worth having, but four
 * paragraphs above the first stop made the plan read as fine print.
 */
export function BudgetBar({
  estimated,
  budget,
  food,
  transport,
  confidence,
  driving = false,
  note = null,
}: {
  estimated: number;
  budget: number;
  food: number;
  transport: number;
  /** Absent on plans made before estimates existed, which are all exact. */
  confidence?: PriceConfidence;
  /** Their own car, so there is no transport half of the split to show. */
  driving?: boolean;
  /** The planner's note on the budget ("dessert stops were kept simple..."). */
  note?: string | null;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const approximate = confidence ? !confidence.exact : false;
  const high = approximate ? (confidence?.high ?? estimated) : estimated;

  /*
   * Said from the same number it is judged on. It was judged on the top of
   * the range and counted from the middle, so a range of 1,884 to 2,116
   * against 2,000 said "GHS 0 over", in red, on a plan that fits. Now: over
   * when even the middle is over; "could go" over when only the top of the
   * range is; otherwise what is left, counted from the top.
   */
  const status =
    estimated > budget
      ? { text: `${ghs(estimated - budget)} over`, tone: "red" as const, over: true }
      : high > budget
        ? { text: `Could go ${ghs(high - budget)} over`, tone: "red" as const, over: true }
        : { text: `${ghs(budget - high)} left`, tone: "green" as const, over: false };
  const pct = budget > 0 ? Math.min(1, estimated / budget) : 0;

  return (
    <View
      style={{
        backgroundColor: c.backgroundElement,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="headline" tabular>
            {approximate && confidence ? `${ghs(confidence.low)} to ${ghs(confidence.high)}` : ghs(estimated)}
          </Text>
          <Text variant="footnote" tone="secondary" tabular>
            of your {ghs(budget)}
            {"  ·  "}
            <Text variant="footnote" tone={status.tone} weight="600">
              {status.text}
            </Text>
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setOpen(!open);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? "Hide how this adds up" : "How this adds up"}
        >
          <Symbol name={open ? "xmark.circle.fill" : "info.circle"} size={22} color={c.textSecondary} />
        </Pressable>
      </View>

      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.backgroundSelected, overflow: "hidden" }}>
        <View
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            borderRadius: radius.pill,
            backgroundColor: status.over ? c.danger : c.accent,
          }}
        />
      </View>

      {open ? (
        <View style={{ gap: space.xs, borderTopWidth: HAIRLINE, borderTopColor: c.border, paddingTop: space.sm, marginTop: space.xs }}>
          {/* A "Transport GHS 0" line is noise; saying the fare is not in the total is the thing worth the space. */}
          <Text variant="footnote" tone="secondary" tabular>
            {driving ? `Food and entry ${ghs(food)} · you are driving` : `Food ${ghs(food)} · Transport ${ghs(transport)} est.`}
          </Text>
          {/* Named rather than hinted at: which stop we are guessing about. */}
          {approximate && confidence?.estimatedStops.length ? (
            <Text variant="footnote" tone="secondary">
              Estimated at {confidence.estimatedStops.join(", ")}, so the total is a range rather than a figure.
            </Text>
          ) : null}
          {note ? (
            <Text variant="footnote" tone="secondary">
              {note}
            </Text>
          ) : null}
          {/* Menu prices, as the menu prints them; many places add tax or service at the bill. */}
          <Text variant="footnote" tone="tertiary">
            Menu prices. Some places add taxes or a service charge to the bill.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The travel leg between two stops, drawn as a timeline connector: a dashed
 * rail with the cost floating on it, so the itinerary reads as one continuous
 * evening rather than a stack of unrelated cards.
 */
export function Hop({
  mins,
  cost,
  driving = false,
}: {
  mins: number;
  cost: number;
  /** Their own car: the journey still takes as long, it just is not bought. */
  driving?: boolean;
}) {
  const c = useTheme();

  return (
    <View style={{ alignItems: "center", paddingVertical: space.sm }}>
      <Dashes />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: space.md,
          paddingVertical: 6,
          borderRadius: radius.pill,
          backgroundColor: c.backgroundElement,
          borderWidth: HAIRLINE,
          borderColor: c.border,
        }}
      >
        <Symbol name="car.fill" size={12} color={c.textSecondary} />
        {/* "GHS 0 est." would read as a broken estimate rather than as a
            journey nobody is paying a fare for. */}
        <Text variant="caption1" tone="secondary" tabular>
          {mins} min · {driving ? "your own drive" : `${ghs(cost)} est.`}
        </Text>
      </View>
      <Dashes />
    </View>
  );
}

/** Three short segments read as a dashed rail without a dashed-border hack. */
function Dashes() {
  const c = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 3, paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{ width: 2, height: 4, borderRadius: 1, backgroundColor: c.border }}
        />
      ))}
    </View>
  );
}
