import { View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { useTheme } from "../lib/useTheme";
import { radius, space } from "../theme";

/**
 * Never pay over the phone: book through Reserve.
 *
 * A number on a listing can be wrong, and someone calling back about a
 * "deposit" may not be the venue at all. Reserve takes people to the
 * venue's own booking page or sends their request through Duro, so that is
 * the way to book, and any deposit belongs on the venue's own booking page.
 */
export const PAY_SAFELY =
  "Never pay a deposit or send money to anyone over a phone call. Book with the Reserve button: it takes you to the venue's own booking page, or sends your request through Duro.";

/** On a venue's own page, which has Book and Call rather than Reserve. */
const PAY_SAFELY_VENUE =
  "Never pay a deposit or send money to anyone over a phone call. If a deposit is needed, pay it only on the venue's own booking page, or plan an outing here and tap Reserve.";

export function PaySafely({ style, where = "plan" }: { style?: StyleProp<ViewStyle>; where?: "plan" | "venue" }) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          gap: space.sm,
          alignItems: "flex-start",
          padding: space.md,
          borderRadius: radius.row,
          backgroundColor: c.backgroundElement,
          borderWidth: 1,
          borderColor: c.border,
        },
        style,
      ]}
    >
      <Symbol name="checkmark.shield.fill" size={16} color={c.accent} />
      <Text variant="footnote" style={{ flex: 1, color: c.textSecondary }}>
        <Text variant="footnote" weight="700" style={{ color: c.text }}>
          Book safely.{" "}
        </Text>
        {where === "venue" ? PAY_SAFELY_VENUE : PAY_SAFELY}
      </Text>
    </View>
  );
}
