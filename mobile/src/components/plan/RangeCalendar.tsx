import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { MONTH_NAMES, WEEKDAYS, monthGrid, parseISO } from "../../lib/calendar";

const CELL = 46;
const DOT = 40;

export type DayRange = { start: string | null; end: string | null };

/** Local YYYY-MM-DD, the shape monthGrid hands out. */
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(dateIso: string, n: number): string {
  const d = parseISO(dateIso);
  d.setDate(d.getDate() + n);
  return localISO(d);
}

/** Days from a to b, counting both. */
export function spanDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000) + 1;
}

/**
 * A month's grid without the weeks that hold no choosable day, so the
 * calendar opens on this week rather than on a block of greyed-out ones.
 */
function visibleWeeks(year: number, month: number, min: string, max: string): (string | null)[] {
  const cells = monthGrid(year, month);
  const out: (string | null)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    if (week.some((d) => d && d >= min && d <= max)) out.push(...week);
  }
  return out;
}

/**
 * Month grids for choosing days: a run of days, or particular ones.
 *
 * In range mode the first tap is the first day and the second the last, and
 * the days between sit on one band with the two ends in solid circles, so the
 * stretch reads at a glance. Tapping after a range is set starts a new one;
 * tapping the first day again makes it a single day. A last day too far out
 * starts over from there instead, since a range that silently stops short is
 * worse than a fresh start.
 *
 * In pick mode each tap toggles a day, shown as a soft green circle.
 *
 * Every month from `min` to `max` is drawn, one above the other, weeks
 * starting Monday like the rest of the app.
 */
export function RangeCalendar({
  mode,
  min,
  max,
  range,
  onRange,
  picked,
  onPicked,
  maxSpan,
  maxPicked,
}: {
  mode: "range" | "pick";
  min: string;
  max: string;
  range: DayRange;
  onRange: (r: DayRange) => void;
  picked: string[];
  onPicked: (days: string[]) => void;
  maxSpan: number;
  maxPicked: number;
}) {
  const c = useTheme();

  const months: { year: number; month: number }[] = [];
  const from = parseISO(min);
  const to = parseISO(max);
  for (let k = from.getFullYear() * 12 + from.getMonth(); k <= to.getFullYear() * 12 + to.getMonth(); k++) {
    months.push({ year: Math.floor(k / 12), month: k % 12 });
  }

  const { start, end } = range;
  const last = end ?? start;

  function tap(d: string) {
    void Haptics.selectionAsync();
    if (mode === "pick") {
      if (picked.includes(d)) onPicked(picked.filter((x) => x !== d));
      else if (picked.length < maxPicked) onPicked([...picked, d]);
      return;
    }
    if (!start || end) return onRange({ start: d, end: null });
    if (d < start) return onRange({ start: d, end: null });
    if (spanDays(start, d) > maxSpan) return onRange({ start: d, end: null });
    onRange({ start, end: d });
  }

  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: space.xs }}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} variant="footnote" tone="secondary" center style={{ flex: 1 }}>
            {w}
          </Text>
        ))}
      </View>

      {months.map(({ year, month }) => (
        <View key={`${year}-${month}`} style={{ marginTop: space.md }}>
          <Text variant="headline" style={{ marginBottom: space.sm }}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {visibleWeeks(year, month, min, max).map((d, i) => {
              if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: CELL }} />;
              const disabled = d < min || d > max;
              const isEnd = mode === "range" && (d === start || d === last);
              const inBand = mode === "range" && Boolean(start && end && end !== start && d >= start && d <= end);
              const isPicked = mode === "pick" && picked.includes(d);
              const col = i % 7;
              return (
                <Pressable
                  key={d}
                  disabled={disabled}
                  onPress={() => tap(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isEnd || isPicked, disabled }}
                  accessibilityLabel={parseISO(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  style={{ width: `${100 / 7}%`, height: CELL, alignItems: "center", justifyContent: "center" }}
                >
                  {/* The band: whole cells between, half cells under the two ends, rounded at a week's edge. */}
                  {inBand ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: (CELL - DOT) / 2,
                        height: DOT,
                        left: d === start ? "50%" : 0,
                        right: d === end ? "50%" : 0,
                        backgroundColor: c.backgroundSunken,
                        borderTopLeftRadius: col === 0 && d !== start ? DOT / 2 : 0,
                        borderBottomLeftRadius: col === 0 && d !== start ? DOT / 2 : 0,
                        borderTopRightRadius: col === 6 && d !== end ? DOT / 2 : 0,
                        borderBottomRightRadius: col === 6 && d !== end ? DOT / 2 : 0,
                      }}
                    />
                  ) : null}
                  <View
                    style={{
                      width: DOT,
                      height: DOT,
                      borderRadius: DOT / 2,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isEnd ? c.text : isPicked ? c.successSoft : "transparent",
                    }}
                  >
                    <Text
                      variant="subheadline"
                      weight={isEnd || isPicked ? "700" : "500"}
                      style={{
                        color: isEnd ? c.background : isPicked ? c.success : disabled ? c.textTertiary : c.text,
                        opacity: disabled ? 0.45 : 1,
                      }}
                    >
                      {Number(d.slice(8, 10))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
