import { ScrollView, View, useWindowDimensions } from "react-native";
import { Text } from "../Text";
import { Mascot } from "../Mascot";
import { PressScale } from "../motion";
import { GUTTER, Radius, Spacing } from "../../theme";
import { useOccasionHue } from "../../lib/useTheme";
import { OCCASIONS } from "../../lib/planConstants";
import type { PlanInputs } from "../../lib/types";

/**
 * "What are you planning?": every occasion in one swipeable row of big cards.
 *
 * The main way into a plan used to start about a thousand points down Home,
 * under everything else. In a row it is the first thing on the screen and
 * takes about 200 points, and two and a half cards show so the third peeking
 * in says there is more to swipe. Order is the caller's: the occasions
 * people plan most go first, because those are the only ones many will see.
 */
const GAP = 12;

export function OccasionRow({
  order,
  onPick,
}: {
  order: readonly PlanInputs["occasion"][];
  onPick: (id: PlanInputs["occasion"]) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.round((width - GUTTER) / 2.5);
  const byId = new Map(OCCASIONS.map((o) => [o.id, o]));
  const items = [
    ...order.map((id) => byId.get(id)).filter((o): o is (typeof OCCASIONS)[number] => Boolean(o)),
    ...OCCASIONS.filter((o) => !order.includes(o.id as PlanInputs["occasion"])),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + GAP}
      snapToAlignment="start"
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap: GAP }}
    >
      {items.map((o) => (
        <OccasionCard key={o.id} occasion={o} width={cardWidth} onPress={() => onPick(o.id as PlanInputs["occasion"])} />
      ))}
    </ScrollView>
  );
}

function OccasionCard({
  occasion,
  width,
  onPress,
}: {
  occasion: { id: string; title: string; sub: string };
  width: number;
  onPress: () => void;
}) {
  const hue = useOccasionHue(occasion.id);
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${occasion.title}. ${occasion.sub}`}
      style={{
        width,
        minHeight: 176,
        padding: Spacing.three,
        borderRadius: Radius.xl,
        backgroundColor: hue.bg,
        justifyContent: "space-between",
      }}
    >
      <View style={{ alignItems: "flex-start" }}>
        <Mascot occasion={occasion.id as PlanInputs["occasion"]} size={72} animate={false} />
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="headline" numberOfLines={2} style={{ color: hue.fg }}>
          {occasion.title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={2}>
          {occasion.sub}
        </Text>
      </View>
    </PressScale>
  );
}
