import { View } from "react-native";
import { Text } from "../Text";
import { radius, space } from "../../theme";
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

/** The travel leg drawn between two stops. */
export function Hop({ mins, cost }: { mins: number; cost: number }) {
  const c = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingVertical: space.md,
        paddingLeft: space.lg,
      }}
    >
      <View style={{ width: 2, height: 20, backgroundColor: c.separator, borderRadius: 1 }} />
      <Text variant="footnote" tone="secondary" tabular>
        {mins} min · {ghs(cost)} est.
      </Text>
    </View>
  );
}
