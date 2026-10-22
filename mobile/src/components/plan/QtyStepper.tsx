import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { useReducedMotion } from "../motion";

/**
 * − 2 +, for a line of an order.
 *
 * The bare glyphs it replaced gave nothing back: the haptic was the faintest
 * one there is and the circles did not change under a finger, so a tap that
 * landed looked like one that had not, and people tapped again. Each button
 * now fills while pressed, sinks a little, and taps back; the number bumps
 * when it changes, and going down from one says it removes the dish.
 */
export function QtyStepper({
  qty,
  label,
  onChange,
}: {
  qty: number;
  /** The dish, for screen readers. */
  label: string;
  onChange: (delta: number) => void;
}) {
  const c = useTheme();
  const reduce = useReducedMotion();
  const bump = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    bump.setValue(1.35);
    // JS driver: native-driven entrances have left views blank on device.
    Animated.spring(bump, { toValue: 1, friction: 4, tension: 160, useNativeDriver: false }).start();
  }, [qty, reduce, bump]);

  function press(delta: number) {
    void Haptics.impactAsync(delta < 0 && qty <= 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    onChange(delta);
  }

  const button = (delta: number) => {
    const removes = delta < 0 && qty <= 1;
    return (
      <Pressable
        onPress={() => press(delta)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={delta > 0 ? `Add one ${label}` : removes ? `Remove ${label}` : `One fewer ${label}`}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.86 : 1 }], opacity: pressed ? 0.85 : 1 })}
      >
        {({ pressed }) => (
          <Symbol
            name={
              delta > 0
                ? pressed
                  ? "plus.circle.fill"
                  : "plus.circle"
                : removes
                  ? pressed
                    ? "trash.circle.fill"
                    : "trash.circle"
                  : pressed
                    ? "minus.circle.fill"
                    : "minus.circle"
            }
            size={24}
            color={delta > 0 ? c.accent : removes ? c.danger : c.textSecondary}
          />
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {button(-1)}
      <Animated.View style={{ transform: [{ scale: bump }] }}>
        <Text variant="subheadline" tabular weight="700" style={{ minWidth: 18, textAlign: "center" }}>
          {qty}
        </Text>
      </Animated.View>
      {button(1)}
    </View>
  );
}
