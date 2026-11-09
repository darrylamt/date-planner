import { View, type ViewStyle } from "react-native";
import type { SymbolViewProps } from "expo-symbols";
import { Symbol } from "./Symbol";
import { useOccasionHue } from "../lib/useTheme";
import type { Occasion } from "../lib/types";

/**
 * An occasion's symbol, in its colours: what stands where the mascots stood.
 *
 * The redesign has no mascots (owner, 2 Nov 2026), and the screens it has not
 * reached yet still have a space shaped for one. This fills it plainly until
 * those screens are rebuilt.
 */
const SYMBOLS: Record<Occasion, SymbolViewProps["name"]> = {
  first_date: "heart.fill",
  anniversary: "gift.fill",
  date_night: "moon.stars.fill",
  friend_outing: "person.3.fill",
  birthday: "birthday.cake.fill",
  graduation: "graduationcap.fill",
  celebration: "party.popper.fill",
  solo_day: "figure.walk",
  business_meeting: "building.2",
  family_day: "figure.and.child.holdinghands",
};

export function OccasionMark({
  occasion,
  size,
  style,
}: {
  occasion: Occasion;
  size: number;
  style?: ViewStyle;
}) {
  const hue = useOccasionHue(occasion);
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Symbol name={SYMBOLS[occasion] ?? "sparkles"} size={Math.round(size * 0.55)} color={hue.fg} />
    </View>
  );
}
