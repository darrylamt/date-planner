import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { GUTTER, radius, space } from "../../theme";
import { useIsDark, useTheme } from "../../lib/useTheme";

const DAYS_AHEAD = 21;
const ITEM_WIDTH = 52;

/** Local date to "YYYY-MM-DD", toISOString would shift across the UTC boundary. */
function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Date picker for the step flow. Most dates people plan are within a couple of
 * weeks, so the common case is a horizontal strip of upcoming days, one tap,
 * no modal. The full calendar stays one tap away for anything further out.
 */
export function DayStrip({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const c = useTheme();
  const isDark = useIsDark();
  const [showCalendar, setShowCalendar] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const days = useMemo(() => {
    const out: { iso: string; weekday: string; day: number; isToday: boolean }[] = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      out.push({
        iso: toIso(d),
        weekday: d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 3),
        day: d.getDate(),
        isToday: i === 0,
      });
    }
    return out;
  }, []);

  const selectedIndex = days.findIndex((d) => d.iso === value);
  /** A date picked from the calendar can fall outside the strip's range. */
  const outsideStrip = selectedIndex === -1;

  const monthLabel = new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: GUTTER,
          marginBottom: space.md,
        }}
      >
        <Text variant="headline">{monthLabel}</Text>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setShowCalendar((s) => !s);
          }}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Symbol name="calendar" size={14} weight="semibold" />
          <Text variant="footnote" weight="600" tone="tint">
            {showCalendar ? "Done" : "Another date"}
          </Text>
        </Pressable>
      </View>

      {showCalendar ? (
        <View
          style={{
            backgroundColor: c.backgroundElement,
            borderRadius: radius.card,
            marginHorizontal: GUTTER,
            paddingVertical: space.sm,
            alignItems: "center",
          }}
        >
          <DateTimePicker
            value={new Date(`${value}T12:00:00`)}
            mode="date"
            display="inline"
            minimumDate={new Date()}
            accentColor={c.accent}
            themeVariant={isDark ? "dark" : "light"}
            onChange={(_e, picked) => {
              if (picked) onChange(toIso(picked));
            }}
          />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.sm }}
          contentOffset={{
            // Keep the selection on screen when returning to this step.
            x: Math.max(0, (selectedIndex - 2) * (ITEM_WIDTH + space.sm)),
            y: 0,
          }}
        >
          {days.map((d) => {
            const on = d.iso === value;
            return (
              <Pressable
                key={d.iso}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChange(d.iso);
                }}
                style={{
                  width: ITEM_WIDTH,
                  paddingVertical: space.md,
                  borderRadius: radius.pill,
                  backgroundColor: on ? c.accent : c.backgroundElement,
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  variant="caption2"
                  weight="600"
                  style={{ color: on ? c.textOnBrand : c.textSecondary }}
                >
                  {d.weekday.toUpperCase()}
                </Text>
                <Text
                  variant="headline"
                  tabular
                  style={{ color: on ? c.textOnBrand : c.text }}
                >
                  {d.day}
                </Text>
                {d.isToday ? (
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: on ? c.textOnBrand : c.accent,
                    }}
                  />
                ) : (
                  <View style={{ height: 4 }} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {outsideStrip && !showCalendar ? (
        <Text
          variant="footnote"
          tone="tint"
          style={{ paddingHorizontal: GUTTER, marginTop: space.sm }}
        >
          {new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}{" "}, outside the next three weeks
        </Text>
      ) : null}
    </View>
  );
}
