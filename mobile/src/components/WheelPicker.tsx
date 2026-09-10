import { useEffect, useRef } from "react";
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { GUTTER, HAIRLINE, Spacing } from "../theme";
import { useTheme } from "../lib/useTheme";

const ITEM_HEIGHT = 52;
/** Odd, so there is a true middle row for the selection to sit in. */
const VISIBLE = 5;

export interface WheelOption<T> {
  value: T;
  label: string;
}

/**
 * Scrolling wheel: the selected value sits large between two hairlines with
 * its neighbours fading away above and below.
 *
 * Replaces the fixed chips for start time and duration. Five preset times
 * covered a fraction of when people actually go out, and adding the rest as
 * chips would have been forty of them in a row.
 */
export function WheelPicker<T extends string | number>({
  options,
  value,
  onChange,
  suffix,
}: {
  options: WheelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Static label beside the wheel, e.g. "hours". */
  suffix?: string;
}) {
  const c = useTheme();
  const ref = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  /** Guards against the scroll handler firing onChange for its own correction. */
  const settling = useRef(false);

  useEffect(() => {
    // Jump, do not animate: this runs on mount and when the value is set from
    // elsewhere, where a scroll animation would look like a stray gesture.
    ref.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
  }, [selectedIndex]);

  function handleSettled(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (settling.current) return;
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    const next = options[clamped];
    if (next && next.value !== value) {
      void Haptics.selectionAsync();
      onChange(next.value);
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <View style={{ height: ITEM_HEIGHT * VISIBLE, justifyContent: "center" }}>
        {/* The two rules marking the selected row. Behind the list, and not
            touchable, so they never intercept a drag. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: ITEM_HEIGHT * 2,
            height: ITEM_HEIGHT,
            borderTopWidth: HAIRLINE,
            borderBottomWidth: HAIRLINE,
            borderColor: c.border,
          }}
        />

        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={handleSettled}
          // A slow drag that stops without momentum never fires the momentum
          // event, so the value would silently not commit.
          onScrollEndDrag={handleSettled}
          contentContainerStyle={{
            // Padding lets the first and last rows reach the middle.
            paddingVertical: ITEM_HEIGHT * 2,
          }}
        >
          {options.map((o, i) => {
            const distance = Math.abs(i - selectedIndex);
            const isSelected = distance === 0;
            return (
              <View
                key={String(o.value)}
                style={{
                  height: ITEM_HEIGHT,
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 160,
                }}
              >
                <Text
                  variant={isSelected ? "display" : "title2"}
                  tabular
                  style={{
                    color: isSelected ? c.text : c.textTertiary,
                    // Fade with distance so the wheel reads as curved.
                    opacity: isSelected ? 1 : Math.max(0.18, 1 - distance * 0.32),
                  }}
                >
                  {o.label}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {suffix ? (
        <Text
          variant="title3"
          tone="secondary"
          style={{ marginLeft: Spacing.two, marginTop: 2 }}
        >
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

export const WHEEL_GUTTER = GUTTER;
