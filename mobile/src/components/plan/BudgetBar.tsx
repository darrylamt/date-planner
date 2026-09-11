import { View } from "react-native";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";
import type { PriceConfidence } from "../../lib/types";

/**
 * Budget meter. The bar is the honest bit: it fills proportionally and turns
 * red the moment an edit pushes the plan over what the user said they had.
 */
export function BudgetBar({
  estimated,
  budget,
  food,
  transport,
  confidence,
}: {
  estimated: number;
  budget: number;
  food: number;
  transport: number;
  /** Absent on plans made before estimates existed, which are all exact. */
  confidence?: PriceConfidence;
}) {
  const c = useTheme();
  const approximate = confidence ? !confidence.exact : false;
  /*
   * Judged on the top of the range, not the middle. If the high end clears the
   * budget then going over is a real possibility, and a meter that only turns
   * red once the midpoint does would reassure someone right up to the bill.
   */
  const over = (approximate ? (confidence?.high ?? estimated) : estimated) > budget;
  const pct = budget > 0 ? Math.min(1, estimated / budget) : 0;
  const remaining = budget - estimated;

  return (
    <View
      style={{
        backgroundColor: c.backgroundElement,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text variant="title3" tabular>
          {approximate && confidence
            ? `${ghs(confidence.low)} to ${ghs(confidence.high)}`
            : ghs(estimated)}
        </Text>
        <Text variant="subheadline" tone="secondary" tabular>
          of {ghs(budget)}
        </Text>
      </View>

      <View
        style={{
          height: 8,
          borderRadius: radius.pill,
          backgroundColor: c.backgroundSelected,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            borderRadius: radius.pill,
            backgroundColor: over ? c.danger : c.accent,
          }}
        />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="footnote" tone="secondary" tabular>
          Food {ghs(food)} · Transport {ghs(transport)} est.
        </Text>
        <Text variant="footnote" tone={over ? "red" : "green"} weight="600" tabular>
          {over ? `${ghs(Math.abs(remaining))} over` : `${ghs(remaining)} left`}
        </Text>
      </View>

      {/*
        Named rather than hinted at. "About" on its own invites the reader to
        assume the number is nearly right, when the honest thing is to say
        which stop we are guessing about.
      */}
      {approximate && confidence?.estimatedStops.length ? (
        <Text variant="caption1" tone="tertiary">
          Estimated at {confidence.estimatedStops.join(", ")}, so the total is a
          range rather than a figure.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The travel leg between two stops, drawn as a timeline connector: a dashed
 * rail with the cost floating on it, so the itinerary reads as one continuous
 * evening rather than a stack of unrelated cards.
 */
export function Hop({ mins, cost }: { mins: number; cost: number }) {
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
        <Text variant="caption1" tone="secondary" tabular>
          {mins} min · {ghs(cost)} est.
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
