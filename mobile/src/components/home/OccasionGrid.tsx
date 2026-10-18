import { View } from "react-native";
import { Text } from "../Text";
import { Mascot } from "../Mascot";
import { PressScale } from "../motion";
import { HAIRLINE, Radius, Spacing } from "../../theme";
import { useOccasionHue, useTheme } from "../../lib/useTheme";
import { OCCASIONS } from "../../lib/planConstants";
import type { PlanInputs } from "../../lib/types";

/**
 * Every occasion as a two-column grid, with what each one is for.
 *
 * Used where there is room to read and choose: the "See all" sheet on Home,
 * and the last step of onboarding, "What are you planning first?".
 */
export function OccasionGrid({ onPick }: { onPick: (id: PlanInputs["occasion"]) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.two, justifyContent: "space-between" }}>
      {OCCASIONS.map((o) => (
        <Tile key={o.id} occasion={o} onPress={() => onPick(o.id as PlanInputs["occasion"])} />
      ))}
    </View>
  );
}

function Tile({ occasion, onPress }: { occasion: { id: string; title: string; sub: string }; onPress: () => void }) {
  const c = useTheme();
  const hue = useOccasionHue(occasion.id);
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${occasion.title}. ${occasion.sub}`}
      style={{
        width: "48.5%",
        padding: Spacing.three,
        borderRadius: Radius.lg,
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
        gap: Spacing.two,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: hue.bg,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Mascot occasion={occasion.id as PlanInputs["occasion"]} size={40} animate={false} style={{ marginTop: 6 }} />
      </View>
      <View style={{ gap: 1 }}>
        <Text variant="subheadline" weight="600">
          {occasion.title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={2}>
          {occasion.sub}
        </Text>
      </View>
    </PressScale>
  );
}
