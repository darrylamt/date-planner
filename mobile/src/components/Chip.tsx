import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";

/**
 * A choice you tap, and feel tapped.
 *
 * It springs down under the finger and back, and a selected chip fills with
 * the occasion's colour while a tick pops in beside the label. The fill is a
 * layer that fades rather than a colour that switches, so the change reads as
 * the chip being chosen rather than as the screen redrawing.
 */
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
  const press = useRef(new Animated.Value(1)).current;
  const on = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(on, { toValue: selected ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 9 }).start();
  }, [selected, on]);

  const springTo = (v: number) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v === 1 ? 10 : 0 }).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => springTo(0.93)}
      onPressOut={() => springTo(1)}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
    >
      <Animated.View
        style={{
          transform: [{ scale: press }],
          opacity: disabled ? 0.4 : 1,
          height: 40,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? c.accent : c.border,
          backgroundColor: c.backgroundElement,
          overflow: "hidden",
          justifyContent: "center",
          shadowColor: c.accent,
          shadowOpacity: selected ? 0.28 : 0,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: c.accent,
            opacity: on,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: 6 }}>
          {selected ? (
            <Animated.View style={{ transform: [{ scale: on }] }}>
              <Symbol name="checkmark" size={12} weight="bold" color={c.textOnBrand} />
            </Animated.View>
          ) : null}
          <Text variant="subheadline" weight="600" style={{ color: selected ? c.textOnBrand : c.text }}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
