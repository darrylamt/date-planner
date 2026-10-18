import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { GUTTER, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { OCCASION_THEME, OCCASIONS } from "../../lib/planConstants";
import {
  MONTH_NAMES,
  WEEKDAYS,
  isRecurring,
  monthGrid,
  occurrenceFor,
  relativeDay,
  today,
} from "../../lib/calendar";
import { longDate } from "../../lib/format";
import type { Occasion, SavedPlan } from "../../lib/types";

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

const OCCASION_TITLE: Record<string, string> = Object.fromEntries(OCCASIONS.map((o) => [o.id, o.title]));

/**
 * Everything planned, on the month it happens: the Calendar view of Plans.
 *
 * It used to be a tab of its own. Plans now holds both, a list and this,
 * because they show the same thing two ways; the plans come from the Plans
 * screen, which owns signing in and loading.
 *
 * Birthdays and anniversaries are projected onto whichever year is being
 * looked at, so they stay useful long after the evening itself. A date night
 * does not, because the fourteenth of March means nothing a year later.
 */
export function PlansCalendar({ plans }: { plans: SavedPlan[] }) {
  const c = useTheme();
  const now = today();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  /** Every plan placed on the year in view, recurring ones projected forward. */
  const entries: Entry[] = useMemo(() => {
    return plans.map((p) => {
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
    entries.forEach((e) => map.set(e.date, [...(map.get(e.date) ?? []), e]));
    return map;
  }, [entries]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  /* What is still to come, nearest first. The part most people open this for. */
  const upcoming = useMemo(
    () => entries.filter((e) => e.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
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

  function EntryRow({ entry, showRelative }: { entry: Entry; showRelative?: boolean }) {
    const tint = OCCASION_THEME[entry.occasion]?.accent ?? c.accent;
    return (
      <Pressable
        // The plan itself; it used to open the list and leave you to find it.
        onPress={() => router.push(`/plan/${entry.slug}`)}
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
            {entry.recurring && entry.yearsSince > 0 ? ` · ${entry.yearsSince} year${entry.yearsSince === 1 ? "" : "s"}` : ""}
            {showRelative ? ` · ${relativeDay(entry.date)}` : ""}
          </Text>
        </View>
        <Symbol name="chevron.right" size={14} color={c.textTertiary} />
      </Pressable>
    );
  }

  return (
    <View>
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
          <Text key={i} variant="caption1" tone="tertiary" center style={{ flex: 1 }}>
            {d}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: GUTTER, marginTop: space.sm }}>
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
              style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? c.accent : isToday ? c.backgroundSelected : "transparent",
                }}
              >
                <Text variant="footnote" style={{ color: isSelected ? "#FFFFFF" : isToday ? c.accent : c.text }}>
                  {day}
                </Text>
              </View>
              {/* One dot per plan, in that occasion's own colour. */}
              <View style={{ flexDirection: "row", gap: 2, height: 5, marginTop: 1 }}>
                {dayEntries.slice(0, 3).map((e) => (
                  <View
                    key={e.id}
                    style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: OCCASION_THEME[e.occasion]?.accent ?? c.accent }}
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

      <Text variant="eyebrow" tone="secondary" uppercase style={{ paddingHorizontal: GUTTER, marginTop: space.xl, marginBottom: space.sm }}>
        Coming up
      </Text>
      <View style={{ paddingHorizontal: GUTTER }}>
        {upcoming.length ? (
          upcoming.map((e) => <EntryRow key={`${e.id}-${e.date}`} entry={e} showRelative />)
        ) : (
          <Text variant="body" tone="tertiary">
            Nothing ahead. Everything saved has already happened.
          </Text>
        )}
      </View>
    </View>
  );
}
