import { Linking, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { startNewPlan } from "../../lib/startPlan";
import type { ChatCard } from "../../lib/types";

/*
 * The places, events and films Durobot named, as a row of cards under its
 * reply (the server's chat/cards.ts; owner, 31 Oct 2026). The picture, where
 * and when, the price, and the next thing to do, instead of a bulleted list
 * of the same facts.
 */
const WIDTH = 236;

/** An hour and a half before something starts, so there is time to eat or get there first. */
function before(start: string | null): string | undefined {
  const m = start?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const at = Math.max(10 * 60, Number(m[1]) * 60 + Number(m[2]) - 90);
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
}

export function ChatCards({ cards, inset }: { cards: ChatCard[]; inset: number }) {
  if (!cards.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={WIDTH + space.sm}
      snapToAlignment="start"
      // Out to the screen's edge, so the row scrolls under it rather than stopping short.
      style={{ marginHorizontal: -GUTTER, marginTop: space.xs, marginBottom: space.md }}
      contentContainerStyle={{ paddingLeft: GUTTER + inset, paddingRight: GUTTER, gap: space.sm }}
    >
      {cards.map((card, i) => (
        <Card key={`${card.kind}:${card.title}:${i}`} card={card} />
      ))}
    </ScrollView>
  );
}

function Card({ card }: { card: ChatCard }) {
  const c = useTheme();
  const tap = (fn: () => void) => () => {
    void Haptics.selectionAsync();
    fn();
  };
  const openVenue = card.venue_id ? () => router.push(`/venue/${card.venue_id}`) : null;
  const directions = () =>
    void Linking.openURL(
      card.lat != null && card.lng != null
        ? `https://maps.apple.com/?q=${encodeURIComponent(card.title)}&ll=${card.lat},${card.lng}`
        : `https://maps.apple.com/?q=${encodeURIComponent(`${card.title} ${card.subtitle} Accra`)}`
    );
  const planAround =
    card.date && card.kind !== "film"
      ? () => void startNewPlan(undefined, "chat", { date: card.date!, ...(before(card.start) ? { start: before(card.start) } : {}) })
      : null;

  // Two at most: the thing most people want next, then the other one.
  const actions: { label: string; icon: string; onPress: () => void }[] = [];
  if (card.kind === "venue") {
    if (openVenue) actions.push({ label: "View", icon: "building.2", onPress: openVenue });
    actions.push({ label: "Directions", icon: "map", onPress: directions });
  } else if (card.kind === "event") {
    if (planAround) actions.push({ label: "Plan around it", icon: "sparkles", onPress: planAround });
    if (openVenue) actions.push({ label: "The place", icon: "building.2", onPress: openVenue });
    else if (card.link) actions.push({ label: "Tickets", icon: "ticket", onPress: () => void Linking.openURL(card.link!) });
  } else {
    if (card.link) actions.push({ label: "Showtimes", icon: "ticket", onPress: () => void Linking.openURL(card.link!) });
    if (openVenue) actions.push({ label: "The cinema", icon: "building.2", onPress: openVenue });
  }
  const main = actions[0];

  return (
    <Pressable
      onPress={main ? tap(main.onPress) : undefined}
      accessibilityRole="button"
      accessibilityLabel={[card.title, card.subtitle, card.detail].filter(Boolean).join(", ")}
      style={({ pressed }) => ({
        width: WIDTH,
        borderRadius: radius.card,
        overflow: "hidden",
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      {card.image_url ? (
        <Image
          source={{ uri: card.image_url }}
          style={{ width: "100%", height: card.kind === "film" ? 150 : 120, backgroundColor: c.backgroundSunken }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={{ height: 72, alignItems: "center", justifyContent: "center", backgroundColor: c.backgroundSunken }}>
          <Symbol name={card.kind === "film" ? "film" : card.kind === "event" ? "ticket" : "fork.knife"} size={26} color={c.textTertiary} />
        </View>
      )}
      <View style={{ padding: space.md, gap: 2, flex: 1 }}>
        <Text variant="caption1" tone="tint" weight="700" style={{ letterSpacing: 0.5 }}>
          {card.kind === "venue" ? "PLACE" : card.kind === "event" ? "EVENT" : "FILM"}
        </Text>
        <Text variant="headline" numberOfLines={2}>
          {card.title}
        </Text>
        {card.subtitle ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {card.subtitle}
          </Text>
        ) : null}
        {card.detail ? (
          <Text variant="footnote" numberOfLines={2} style={{ marginTop: 2 }}>
            {card.detail}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.xs, marginTop: space.sm }}>
          {actions.map((a, i) => (
            <Pressable
              key={a.label}
              onPress={tap(a.onPress)}
              accessibilityRole="button"
              accessibilityLabel={`${a.label}: ${card.title}`}
              hitSlop={4}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: space.sm + 2,
                height: 32,
                borderRadius: radius.pill,
                backgroundColor: i === 0 ? c.accent : c.backgroundSelected,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Symbol name={a.icon as never} size={12} color={i === 0 ? c.textOnBrand : c.text} weight="semibold" />
              <Text variant="footnote" weight="700" style={{ color: i === 0 ? c.textOnBrand : c.text }}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Pressable>
  );
}
