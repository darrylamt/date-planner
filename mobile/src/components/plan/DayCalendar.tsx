import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { MONTH_NAMES, WEEKDAYS, monthGrid, parseISO } from "../../lib/calendar";

const CELL = 46;
const DOT = 40;

/**
 * One month at a time, for choosing a single day: the planner's "Another
 * date". Drawn like the group calendar (RangeCalendar), with the chosen day
 * in a solid circle and today ringed, instead of the phone's own calendar,
 * which looked like Settings and different again on Android.
 *
 * Days before `min` are faded and cannot be chosen.
 */
export function DayCalendar({ value, min, onChange }: { value: string; min: string; onChange: (iso: string) => void }) {
  const c = useTheme();
  const shown = parseISO(value);
  const [year, setYear] = useState(shown.getFullYear());
  const [month, setMonth] = useState(shown.getMonth());
  const floor = parseISO(min);
  const atFloor = year * 12 + month <= floor.getFullYear() * 12 + floor.getMonth();

  const shift = (by: number) => {
    void Haptics.selectionAsync();
    const k = year * 12 + month + by;
    setYear(Math.floor(k / 12));
    setMonth(k % 12);
  };

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md }}>
        <Pressable
          onPress={() => shift(-1)}
          disabled={atFloor}
          hitSlop={12}
          accessibilityLabel="Previous month"
          style={{ opacity: atFloor ? 0.3 : 1 }}
        >
          <Symbol name="chevron.left" size={18} color={c.text} />
        </Pressable>
        <Text variant="headline">
          {MONTH_NAMES[month]} {year}
        </Text>
        <Pressable onPress={() => shift(1)} hitSlop={12} accessibilityLabel="Next month">
          <Symbol name="chevron.right" size={18} color={c.text} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", marginBottom: space.xs }}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} variant="footnote" tone="secondary" center style={{ flex: 1 }}>
            {w}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {monthGrid(year, month).map((d, i) => {
          if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: CELL }} />;
          const disabled = d < min;
          const on = d === value;
          const isToday = d === min;
          return (
            <Pressable
              key={d}
              disabled={disabled}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(d);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled }}
              accessibilityLabel={parseISO(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              style={{ width: `${100 / 7}%`, height: CELL, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? c.text : "transparent",
                  borderWidth: isToday && !on ? 1.5 : 0,
                  borderColor: c.border,
                }}
              >
                <Text
                  variant="subheadline"
                  weight={on ? "700" : "500"}
                  style={{ color: on ? c.background : disabled ? c.textTertiary : c.text, opacity: disabled ? 0.45 : 1 }}
                >
                  {Number(d.slice(8, 10))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
