import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";

/** Selectable pill. Tinted when on, neutral fill when off. */
export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        paddingHorizontal: space.lg,
        height: 36,
        justifyContent: "center",
        borderRadius: radius.pill,
        backgroundColor: selected ? c.tint : c.fill,
        opacity: pressed ? 0.6 : disabled ? 0.4 : 1,
      })}
    >
      <Text variant="subheadline" weight="600" style={{ color: selected ? c.onTint : c.label }}>
        {label}
      </Text>
    </Pressable>
  );
}
