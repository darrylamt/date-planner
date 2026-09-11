import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Symbol } from "../../src/components/Symbol";
import { Mascot, SpeechBubble } from "../../src/components/Mascot";
import { GUTTER, TAB_BAR, radius, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth } from "../../src/lib/useAuth";
import { listPlans } from "../../src/lib/data";
import { OCCASION_THEME, OCCASIONS } from "../../src/lib/planConstants";
import {
  MONTH_NAMES,
  WEEKDAYS,
  isRecurring,
  monthGrid,
  occurrenceFor,
  parseISO,
  relativeDay,
  today,
} from "../../src/lib/calendar";
import { longDate } from "../../src/lib/format";
import type { Occasion, SavedPlan } from "../../src/lib/types";

interface Entry {
  id: string;
  slug: string;
  occasion: Occasion;
  date: string;
  originalDate: string;
  yearsSince: number;
  recurring: boolean;
  title: string;
}

const OCCASION_TITLE: Record<string, string> = Object.fromEntries(
  OCCASIONS.map((o) => [o.id, o.title])
);

/**
 * Everything planned, on the month it happens.
 *
 * A plan is the rare thing that expires, and a list sorted by when it was
 * made buries the one happening on Saturday underneath one from March. The
 * calendar is the shape that matches what a plan actually is.
 *
 * Birthdays and anniversaries are projected onto whichever year is being
 * looked at, so they stay useful long after the evening itself. A date night
 * does not, because the fourteenth of March means nothing a year later.
 */
export default function CalendarScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const now = today();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!session) {
        setPlans([]);
        return;
      }
      void listPlans()
        .then((p) => active && setPlans(p))
        .catch(() => active && setPlans([]));
      return () => {
        active = false;
      };
    }, [session])
  );

  /** Every plan placed on the year in view, recurring ones projected forward. */
  const entries: Entry[] = useMemo(() => {
    return (plans ?? []).map((p) => {
      const inputs = p.inputs as { date: string; occasion: Occasion };
      const occasion = inputs.occasion ?? "date_night";
      const { date, yearsSince } = occurrenceFor(inputs.date, occasion, year);
      return {
        id: p.id,
        slug: p.share_slug,
        occasion,
        date,
        originalDate: inputs.date,
        yearsSince,
        recurring: isRecurring(occasion),
        title: (p.itinerary as { title?: string })?.title ?? OCCASION_TITLE[occasion] ?? "Plan",
      };
    });
  }, [plans, year]);

  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    entries.forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [entries]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  /* What is still to come, nearest first. The part most people open this for. */
  const upcoming = useMemo(
    () =>
      entries
        .filter((e) => e.date >= todayISO)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 6),
    [entries, todayISO]
  );

  const shift = (by: number) => {
    void Haptics.selectionAsync();
    const m = month + by;
    if (m < 0) {
      setMonth(11);
      setYear(year - 1);
    } else if (m > 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(m);
    }
    setSelected(null);
  };

  const selectedEntries = selected ? (byDate.get(selected) ?? []) : [];

  if (!session) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: GUTTER,
        }}
      >
        <Mascot occasion="date_night" size={96} />
        <SpeechBubble text="Sign in and your plans show up here, by the day they happen." />
        <View style={{ marginTop: space.lg, alignSelf: "stretch" }}>
          <Button title="Sign in" onPress={() => router.push("/login")} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: TAB_BAR.clearance,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: GUTTER,
          marginBottom: space.lg,
        }}
      >
        <Pressable onPress={() => shift(-1)} hitSlop={12}>
          <Symbol name="chevron.left" size={20} color={c.accent} />
        </Pressable>
        <Text variant="title3">
          {MONTH_NAMES[month]} {year}
        </Text>
        <Pressable onPress={() => shift(1)} hitSlop={12}>
          <Symbol name="chevron.right" size={20} color={c.accent} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", paddingHorizontal: GUTTER }}>
        {WEEKDAYS.map((d, i) => (
          <Text
            key={i}
            variant="caption1"
            tone="tertiary"
            center
            style={{ flex: 1 }}
          >
            {d}
          </Text>
        ))}
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          paddingHorizontal: GUTTER,
          marginTop: space.sm,
        }}
      >
        {cells.map((iso, i) => {
          if (!iso) return <View key={i} style={{ width: `${100 / 7}%`, height: 46 }} />;

          const dayEntries = byDate.get(iso) ?? [];
          const isToday = iso === todayISO;
          const isSelected = iso === selected;
          const day = Number(iso.slice(8, 10));

          return (
            <Pressable
              key={i}
              onPress={() => {
                void Haptics.selectionAsync();
                setSelected(isSelected ? null : iso);
              }}
              style={{
                width: `${100 / 7}%`,
                height: 46,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected
                    ? c.accent
                    : isToday
                      ? c.backgroundSelected
                      : "transparent",
                }}
              >
                <Text
                  variant="footnote"
                  style={{
                    color: isSelected ? "#FFFFFF" : isToday ? c.accent : c.text,
                  }}
                >
                  {day}
                </Text>
              </View>

              {/* One dot per plan, in that occasion's own colour. */}
              <View style={{ flexDirection: "row", gap: 2, height: 5, marginTop: 1 }}>
                {dayEntries.slice(0, 3).map((e) => (
                  <View
                    key={e.id}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: OCCASION_THEME[e.occasion]?.accent ?? c.accent,
                    }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <View style={{ paddingHorizontal: GUTTER, marginTop: space.lg }}>
          <Text variant="footnote" tone="secondary" style={{ marginBottom: space.sm }}>
            {longDate(selected)}
          </Text>
          {selectedEntries.length ? (
            selectedEntries.map((e) => <EntryRow key={e.id} entry={e} />)
          ) : (
            <Text variant="body" tone="tertiary">
              Nothing planned.
            </Text>
          )}
        </View>
      ) : null}

      <Text
        variant="eyebrow"
        tone="secondary"
        uppercase
        style={{ paddingHorizontal: GUTTER, marginTop: space.xl, marginBottom: space.sm }}
      >
        Coming up
      </Text>

      {upcoming.length ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          {upcoming.map((e) => (
            <EntryRow key={`${e.id}-${e.date}`} entry={e} showRelative />
          ))}
        </View>
      ) : (
        <View style={{ paddingHorizontal: GUTTER }}>
          <Text variant="body" tone="tertiary">
            {plans === null
              ? "Loading."
              : plans.length
                ? "Nothing ahead. Everything saved has already happened."
                : "No plans yet."}
          </Text>
        </View>
      )}
    </ScrollView>
  );

  function EntryRow({ entry, showRelative }: { entry: Entry; showRelative?: boolean }) {
    const tint = OCCASION_THEME[entry.occasion]?.accent ?? c.accent;
    return (
      <Pressable
        onPress={() => router.push(`/(tabs)/saved`)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          backgroundColor: c.backgroundElement,
          borderRadius: radius.control,
          padding: space.md,
          marginBottom: space.sm,
        }}
      >
        <View style={{ width: 3, height: 34, borderRadius: 2, backgroundColor: tint }} />
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {entry.title}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {OCCASION_TITLE[entry.occasion] ?? entry.occasion}
            {/* A recurring occasion is worth counting: the third anniversary
                reads very differently from the first. */}
            {entry.recurring && entry.yearsSince > 0
              ? ` · ${entry.yearsSince} year${entry.yearsSince === 1 ? "" : "s"}`
              : ""}
            {showRelative ? ` · ${relativeDay(entry.date)}` : ""}
          </Text>
        </View>
        <Symbol name="chevron.right" size={14} color={c.textTertiary} />
      </Pressable>
    );
  }
}
