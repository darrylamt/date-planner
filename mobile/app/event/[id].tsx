import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Share, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER, radius, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { longDate } from "../../src/lib/format";
import { bookingOf, eventPrice, eventTime, fetchEvent, type EventDetail } from "../../src/lib/events";

/**
 * One event (owner, 5 Nov 2026: "the featured event card should take me to
 * see the event"): the poster, when, what it costs, where, what it is, and
 * where to book. A Gaderin listing books on Gaderin's own site.
 */
export default function EventPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [e, setE] = useState<EventDetail | null | undefined>(undefined);

  useEffect(() => {
    let on = true;
    void fetchEvent(id).then((x) => on && setE(x));
    return () => {
      on = false;
    };
  }, [id]);

  if (e === undefined) return <View style={{ flex: 1, backgroundColor: c.background }} />;
  if (e === null) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, padding: GUTTER, gap: space.md }}>
        <Text variant="title2">This event isn't on any more</Text>
        <Button title="See what's on" onPress={() => router.replace("/events")} />
      </View>
    );
  }

  const time = eventTime(e.start_time);
  const price = eventPrice(e.cost_ghs);
  const book = bookingOf(e);
  const picture = e.image_url ?? e.venue?.image_url ?? null;
  const facts: { icon: "calendar" | "clock" | "ticket" | "mappin.and.ellipse"; text: string }[] = [
    { icon: "calendar", text: longDate(e.event_date) },
    ...(time ? [{ icon: "clock" as const, text: time }] : []),
    { icon: "ticket", text: price ?? "Price not on record" },
    ...(e.venue ? [{ icon: "mappin.and.ellipse" as const, text: [e.venue.name, e.venue.area].filter(Boolean).join(", ") }] : []),
  ];

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        {picture ? (
          <View>
            <Image source={{ uri: picture }} style={{ width: "100%", aspectRatio: 4 / 5 }} contentFit="cover" transition={200} />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: GUTTER, gap: space.md, marginTop: space.lg }}>
          {e.organiser_name ? (
            <Text variant="caption" tone="tint" weight="700" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
              {e.organiser_name}
            </Text>
          ) : null}
          <Text variant="largeTitle">{e.title}</Text>

          <View style={{ gap: space.sm, marginTop: space.xs }}>
            {facts.map((f) => (
              <View key={f.text} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Symbol name={f.icon} size={16} color={c.accent} />
                <Text variant="body" style={{ flex: 1 }}>
                  {f.text}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {book ? <Button title={book.label} icon="ticket.fill" onPress={() => void Linking.openURL(book.url)} /> : null}
            {e.contact_phone ? (
              <Button title="Call the organiser" kind="tinted" icon="phone.fill" onPress={() => void Linking.openURL(`tel:${e.contact_phone!.replace(/\s/g, "")}`)} />
            ) : null}
            {e.venue?.google_maps_url ? (
              <Button title="Directions" kind="gray" icon="map.fill" onPress={() => void Linking.openURL(e.venue!.google_maps_url!)} />
            ) : null}
          </View>

          {e.description ? (
            <Text variant="body" tone="secondary" style={{ marginTop: space.md }}>
              {e.description}
            </Text>
          ) : null}

          {e.venue ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/venue/${e.venue!.id}`)}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg, padding: space.md, borderRadius: radius.card, backgroundColor: c.backgroundElement }}
            >
              <Symbol name="building.2" size={18} color={c.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="headline">{e.venue.name}</Text>
                <Text variant="footnote" tone="secondary">
                  See the place
                </Text>
              </View>
              <Symbol name="chevron.right" size={14} color={c.textTertiary} />
            </Pressable>
          ) : null}

          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
            <Button title="All events" kind="plain" onPress={() => router.push("/events")} />
            <Button
              title="Share"
              kind="plain"
              icon="square.and.arrow.up"
              onPress={() => void Share.share({ message: `${e.title}, ${longDate(e.event_date)}${time ? ` at ${time}` : ""}${book ? `: ${book.url}` : ""}` })}
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}
