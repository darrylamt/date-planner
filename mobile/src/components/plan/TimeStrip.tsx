import { useEffect, useRef } from "react";
import { Pressable, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { GUTTER, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";

const ITEM_WIDTH = 84;
const GAP = 8;

/** Which part of the day a "HH:MM" falls in, said under the time. */
function partOfDay(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 21) return "Evening";
  return "Late";
}

/**
 * Start times as a row of pills you swipe sideways, one tap to choose.
 *
 * It replaced the iPhone's wheel, which took spinning to reach seven in the
 * evening and looked like the phone's Settings rather than the app. Every
 * half hour is here, so nothing was lost; the row opens on the chosen time,
 * and each pill says which part of the day it is, so a quick scroll reads as
 * morning, afternoon, evening rather than a run of numbers. The chosen one
 * fills with the accent, like the chips under it.
 */
export function TimeStrip({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const c = useTheme();
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const offset = Math.max(0, index * (ITEM_WIDTH + GAP) - ITEM_WIDTH);

  /*
   * Open on the chosen time, a little in from the left with earlier neighbours
   * peeking. contentOffset does that on iOS only, so this does it everywhere;
   * once, so a later tap never yanks the row back.
   */
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current) return;
    placed.current = true;
    const t = setTimeout(() => ref.current?.scrollTo({ x: offset, animated: false }), 0);
    return () => clearTimeout(t);
  }, [offset]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap: GAP }}
      contentOffset={{ x: offset, y: 0 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              width: ITEM_WIDTH,
              paddingVertical: space.sm,
              borderRadius: radius.control,
              alignItems: "center",
              backgroundColor: on ? c.accent : c.backgroundElement,
              borderWidth: 1,
              borderColor: on ? c.accent : c.border,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text variant="subheadline" weight={on ? "700" : "600"} style={{ color: on ? c.textOnBrand : c.text }}>
              {o.label}
            </Text>
            <Text variant="caption2" style={{ color: on ? c.textOnBrand : c.textSecondary, opacity: on ? 0.85 : 1 }}>
              {partOfDay(o.value)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
