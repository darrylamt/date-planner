import { View } from "react-native";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";

/**
 * Budget meter. The bar is the honest bit: it fills proportionally and turns
 * red the moment an edit pushes the plan over what the user said they had.
 */
export function BudgetBar({
  estimated,
  budget,
  food,
  transport,
}: {
  estimated: number;
  budget: number;
  food: number;
  transport: number;
}) {
  const c = useTheme();
  const over = estimated > budget;
  const pct = budget > 0 ? Math.min(1, estimated / budget) : 0;
  const remaining = budget - estimated;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text variant="title3" tabular>
          {ghs(estimated)}
        </Text>
        <Text variant="subheadline" tone="secondary" tabular>
          of {ghs(budget)}
        </Text>
      </View>

      <View
        style={{
          height: 8,
          borderRadius: radius.pill,
          backgroundColor: c.fill,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            borderRadius: radius.pill,
            backgroundColor: over ? c.red : c.tint,
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
          backgroundColor: c.surface,
          borderWidth: HAIRLINE,
          borderColor: c.separator,
        }}
      >
        <Symbol name="car.fill" size={12} color={c.secondaryLabel} />
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
          style={{ width: 2, height: 4, borderRadius: 1, backgroundColor: c.separator }}
        />
      ))}
    </View>
  );
}
