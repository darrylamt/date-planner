import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../src/components/Text";
import { Symbol } from "../src/components/Symbol";
import { GUTTER, radius, space } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { longDate } from "../src/lib/format";
import { eventPrice, eventTime, fetchUpcomingEvents, type EventDetail } from "../src/lib/events";

type Filter = "all" | "today" | "weekend" | "free";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "today", label: "Today" },
  { id: "weekend", label: "This weekend" },
  { id: "free", label: "Free" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * What's on (owner, 5 Nov 2026: "build a nice page for events, even the ones
 * from the gaderin"): every event for the next four weeks, by day, each
 * opening its own page. Gaderin's listings are here too and book on Gaderin.
 */
export default function EventsPage() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<EventDetail[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let on = true;
    void fetchUpcomingEvents().then((x) => on && setEvents(x));
    return () => {
      on = false;
    };
  }, []);

  const days = useMemo(() => {
    const now = new Date();
    const today = iso(now);
    // This weekend: Friday to Sunday, the one under way or the next.
    const back = now.getDay() === 6 ? 1 : now.getDay() === 0 ? 2 : -((5 - now.getDay() + 7) % 7);
    const fri = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const weekend = new Set([0, 1, 2].map((i) => iso(new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + i))));
    const shown = (events ?? []).filter((e) =>
      filter === "today" ? e.event_date === today : filter === "weekend" ? weekend.has(e.event_date) : filter === "free" ? Number(e.cost_ghs) === 0 && e.cost_ghs != null : true
    );
    const by = new Map<string, EventDetail[]>();
    for (const e of shown) by.set(e.event_date, [...(by.get(e.event_date) ?? []), e]);
    return [...by.entries()];
  }, [events, filter]);

  return (
    <>
      <Stack.Screen options={{ title: "What's on" }} />
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.sm, paddingVertical: space.md }}>
          {FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.id)}
                style={{ paddingHorizontal: space.md, height: 36, borderRadius: 18, justifyContent: "center", backgroundColor: on ? c.accent : c.backgroundElement }}
              >
                <Text variant="subheadline" weight="600" style={{ color: on ? c.background : c.text }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {events === null ? null : !days.length ? (
          <Text variant="body" tone="secondary" style={{ paddingHorizontal: GUTTER, marginTop: space.lg }}>
            Nothing on for that yet.
          </Text>
        ) : (
          days.map(([date, list]) => (
            <View key={date} style={{ marginTop: space.lg }}>
              <Text variant="title2" style={{ paddingHorizontal: GUTTER, marginBottom: space.sm }}>
                {longDate(date)}
              </Text>
              {list.map((e) => {
                const time = eventTime(e.start_time);
                const price = eventPrice(e.cost_ghs);
                const pic = e.image_url ?? e.venue?.image_url ?? null;
                return (
                  <Pressable
                    key={e.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/event/${e.id}`)}
                    style={({ pressed }) => ({ flexDirection: "row", gap: space.md, paddingHorizontal: GUTTER, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}
                  >
                    <View style={{ width: 72, height: 72, borderRadius: radius.row, overflow: "hidden", backgroundColor: c.backgroundElement, alignItems: "center", justifyContent: "center" }}>
                      {pic ? <Image source={{ uri: pic }} style={{ width: 72, height: 72 }} contentFit="cover" /> : <Symbol name="sparkles" size={20} color={c.accent} />}
                    </View>
                    <View style={{ flex: 1, justifyContent: "center", gap: 2 }}>
                      <Text variant="headline" numberOfLines={2}>
                        {e.title}
                      </Text>
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {[time, e.venue?.name, e.venue?.area].filter(Boolean).join(" · ")}
                      </Text>
                      {price ? (
                        <Text variant="footnote" tone="tint" weight="600">
                          {price}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}
