import { useEffect, useRef } from "react";
import { Animated, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { useReducedMotion } from "./motion";
import { useIsDark, useTheme } from "../lib/useTheme";

const W = 52;
const H = 32;
const PAD = 3;
const KNOB = H - PAD * 2;

/**
 * On or off, drawn in the same language as Segmented: a soft pill track and
 * a raised white knob, filling with the accent when on.
 *
 * It replaced React Native's Switch, which is the phone's own control and
 * looked like iOS Settings on iPhone and something else again on Android.
 * The knob slides on the JS driver and lands regardless after a moment;
 * under Reduce Motion it jumps.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (on: boolean) => void;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const dark = useIsDark();
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    const to = value ? 1 : 0;
    if (reduced) {
      t.setValue(to);
      return;
    }
    Animated.spring(t, { toValue: to, useNativeDriver: false, speed: 22, bounciness: 5 }).start();
    const safety = setTimeout(() => t.setValue(to), 600);
    return () => clearTimeout(safety);
  }, [value, reduced, t]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onValueChange(!value);
      }}
    >
      <Animated.View
        style={{
          width: W,
          height: H,
          borderRadius: H / 2,
          padding: PAD,
          backgroundColor: t.interpolate({ inputRange: [0, 1], outputRange: [c.backgroundSunken, c.accent] }),
        }}
      >
        <Animated.View
          style={{
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: "#FFFFFF",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: dark ? 0.4 : 0.15,
            shadowRadius: 4,
            elevation: 3,
            transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, W - PAD * 2 - KNOB] }) }],
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
