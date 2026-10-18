import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { useReducedMotion } from "./motion";
import { GUTTER, space } from "../theme";
import { useIsDark, useTheme } from "../lib/useTheme";

const HEIGHT = 44;
const PAD = 4;

/**
 * A pill track with a raised white thumb that slides to the choice, and an
 * optional label above it.
 *
 * It replaced the native iOS segmented control, which drew a small grey
 * rectangle that looked like settings rather than a choice, and looked
 * different again on Android. This one is drawn the same on both: a soft
 * track, a lifted thumb, the chosen word in full weight.
 *
 * The thumb moves on the JS driver, and lands on its place regardless after
 * a moment, the same rule as every entrance (native-driven ones stalled on
 * the phone). Under Reduce Motion it simply jumps.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useTheme();
  const dark = useIsDark();
  const reduced = useReducedMotion();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [width, setWidth] = useState(0);
  const segment = width ? (width - PAD * 2) / options.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!segment) return;
    const to = index * segment;
    // The first placement, and Reduce Motion, are a jump, not a slide in from the left.
    if (!placed.current || reduced) {
      placed.current = true;
      x.setValue(to);
      return;
    }
    Animated.spring(x, { toValue: to, useNativeDriver: false, speed: 22, bounciness: 4 }).start();
    const safety = setTimeout(() => x.setValue(to), 600);
    return () => clearTimeout(safety);
  }, [index, segment, reduced, x]);

  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? (
        <Text variant="footnote" tone="secondary" style={{ marginBottom: space.sm }}>
          {label}
        </Text>
      ) : null}
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height: HEIGHT,
          padding: PAD,
          borderRadius: HEIGHT / 2,
          backgroundColor: c.backgroundSunken,
          flexDirection: "row",
        }}
      >
        {segment ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: PAD,
              left: PAD,
              width: segment,
              height: HEIGHT - PAD * 2,
              borderRadius: (HEIGHT - PAD * 2) / 2,
              backgroundColor: dark ? c.backgroundSelected : c.backgroundElement,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: dark ? 0.4 : 0.12,
              shadowRadius: 6,
              elevation: 3,
              transform: [{ translateX: x }],
            }}
          />
        ) : null}
        {options.map((o, i) => {
          const on = i === index;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return;
                void Haptics.selectionAsync();
                onChange(o.value);
              }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xs }}
            >
              <Text
                variant="subheadline"
                weight={on ? "600" : "500"}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ color: on ? c.text : c.textSecondary }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Wrapping chip row, for multi-select where a segmented control would
 * overflow (vibes, durations with many options).
 */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: space.sm,
        paddingHorizontal: GUTTER,
      }}
    >
      {children}
    </View>
  );
}
