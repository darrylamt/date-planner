import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { StopGallery } from "../../src/components/plan/StopGallery";
import { Paywall } from "../../src/components/chat/Paywall";
import { GUTTER, HAIRLINE, radius, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { ghs, instagramUrl } from "../../src/lib/format";
import { fetchMenu, fetchVenue, type VenueDetail } from "../../src/lib/data";
import { fetchAllowance } from "../../src/lib/chat";
import { useAuth } from "../../src/lib/useAuth";
import { VENUE_KIND } from "../../src/lib/venueKinds";
import type { MenuItem } from "../../src/lib/types";
import type { SymbolViewProps } from "expo-symbols";

const CATEGORY_LABEL: Record<string, string> = {
  starter: "Starters",
  main: "Mains",
  dessert: "Desserts",
  drink: "Drinks",
  activity: "Activities",
  other: "Other",
};
const CATEGORY_ORDER = ["main", "starter", "dessert", "drink", "activity", "other"];
/** A section shows this many until opened; a 180-line menu is a scroll, not a page. */
const PREVIEW = 6;

/**
 * One venue, in full.
 *
 * The top of the page is free for everybody: pictures, name, what kind of
 * place, roughly what it costs and the description. That is what the list
 * already promised, and taking it away behind a paywall would be making
 * somebody pay to see what they just tapped.
 *
 * Pro opens the rest: the menu with its prices, the hours, how to reach them
 * and the notes that decide whether it suits tonight. Not a security boundary
 * -- menus are public and every plan shows them -- but a page, and the page is
 * what is being sold.
 *
 * Reviews and "most liked" are not here yet because nothing collects them.
 * An empty "Reviews" heading is a promise the page cannot keep, so those
 * sections arrive with the recommendations that fill them.
 */
export default function VenuePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [venue, setVenue] = useState<VenueDetail | null | undefined>(undefined);
  const [pro, setPro] = useState<boolean | null>(null);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    fetchVenue(id)
      .then((v) => active && setVenue(v))
      .catch(() => active && setVenue(null));
    return () => {
      active = false;
    };
  }, [id]);

  const checkPro = useCallback(async () => {
    const a = await fetchAllowance().catch(() => null);
    setPro(a?.tier === "pro");
  }, []);

  useEffect(() => {
    void checkPro();
  }, [checkPro, session?.user.id]);

  // The menu only once it will be shown.
  useEffect(() => {
    if (!pro || menu) return;
    let active = true;
    fetchMenu(id)
      .then((m) => active && setMenu(m))
      .catch(() => active && setMenu([]));
    return () => {
      active = false;
    };
  }, [pro, id, menu]);

  const sections = useMemo(() => {
    const by = new Map<string, MenuItem[]>();
    for (const item of menu ?? []) {
      const list = by.get(item.category) ?? [];
      list.push(item);
      by.set(item.category, list);
    }
    return CATEGORY_ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, items: by.get(k)! }));
  }, [menu]);

  if (venue === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  if (venue === null) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center", padding: GUTTER }}>
        <Text variant="body" tone="secondary" center>
          We could not find this place. It may have closed or been taken down.
        </Text>
      </View>
    );
  }

  const images = [venue.image_url, ...venue.gallery_urls].filter((u): u is string => Boolean(u));
  const instagram = instagramUrl(venue.instagram_handle);
  const dial = venue.phone?.replace(/[^\d+]/g, "") || null;
  const maps =
    venue.google_maps_url ??
    `https://maps.apple.com/?q=${encodeURIComponent(`${venue.name} ${venue.area ?? ""} ${venue.city ?? "Accra"}`)}`;

  const notes: string[] = [];
  if (venue.best_for.length) notes.push(`Good for ${venue.best_for.join(", ").replace(/_/g, " ")}`);
  if (venue.vibe_tags.length) notes.push(`Feels ${venue.vibe_tags.join(", ")}`);
  if (venue.dress_code) notes.push(`Dress: ${venue.dress_code}`);
  if (venue.cuisines.length) notes.push(`Serves ${venue.cuisines.join(", ")}`);
  if (venue.max_party_size) notes.push(`Groups up to ${venue.max_party_size}`);
  if (venue.reservation_required) notes.push("Book ahead");
  // Only what somebody asked the venue. Null is "nobody has asked", not "no".
  if (venue.has_vegetarian_options === true) notes.push("Vegetarian options, confirmed with the venue");
  if (venue.has_vegetarian_options === false) notes.push("No vegetarian options, confirmed with the venue");

  return (
    <>
      <Stack.Screen options={{ title: venue.name }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      >
        {images.length ? <StopGallery images={images} alt={venue.name} /> : null}

        <View style={{ padding: GUTTER, gap: space.sm }}>
          <Text variant="title1">{venue.name}</Text>
          <Text variant="subheadline" tone="secondary">
            {[VENUE_KIND[venue.type] ?? venue.type, venue.area, venue.city].filter(Boolean).join(" · ")}
          </Text>
          {venue.avg_cost_per_person_ghs ? (
            <Text variant="subheadline" tone="secondary" tabular>
              About {ghs(venue.avg_cost_per_person_ghs)} a head
            </Text>
          ) : null}
          {venue.place_rating ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <Symbol name="star.fill" size={13} color={c.accent} />
              <Text variant="footnote" tone="secondary" tabular>
                {venue.place_rating.toFixed(1)} on Google
                {venue.place_rating_count ? ` · ${venue.place_rating_count.toLocaleString()} ratings` : ""}
              </Text>
            </View>
          ) : null}
          {venue.description ? (
            <Text variant="body" style={{ marginTop: space.sm }}>
              {venue.description}
            </Text>
          ) : null}
        </View>

        {pro === null ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: space.lg }} />
        ) : !pro ? (
          <View style={{ paddingHorizontal: GUTTER, gap: space.md }}>
            {/*
              Said as the list of what is behind it, because "Unlock" alone
              asks somebody to pay for a surprise.
            */}
            <View
              style={{
                padding: space.lg,
                borderRadius: radius.card,
                backgroundColor: c.backgroundElement,
                gap: space.sm,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Symbol name="lock.fill" size={15} color={c.accent} />
                <Text variant="headline">The full page is part of aduro Pro</Text>
              </View>
              {[
                "The whole menu, with prices",
                "Opening hours",
                "Call, book or message them in a tap",
                "Who it suits, the dress code, group sizes",
              ].map((line) => (
                <Text key={line} variant="footnote" tone="secondary">
                  • {line}
                </Text>
              ))}
            </View>
            <Paywall tier="free" reason="browse" onPurchased={() => void checkPro()} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: GUTTER, gap: space.xl }}>
            {/* Reach them */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              <Action icon="map" label="Map" onPress={() => void Linking.openURL(maps)} />
              {dial ? <Action icon="phone.fill" label="Call" onPress={() => void Linking.openURL(`tel:${dial}`)} /> : null}
              {venue.booking_url ? (
                <Action icon="calendar.badge.plus" label="Book" onPress={() => void Linking.openURL(venue.booking_url!)} />
              ) : null}
              {instagram ? (
                <Action icon="camera" label="Instagram" onPress={() => void Linking.openURL(instagram)} />
              ) : null}
            </View>

            {notes.length ? (
              <Section title="Good to know">
                {notes.map((n) => (
                  <Text key={n} variant="body">
                    • {n}
                  </Text>
                ))}
              </Section>
            ) : null}

            <Section title="Hours">
              {venue.opening_hours_text?.length ? (
                venue.opening_hours_text.map((line) => (
                  <Text key={line} variant="body" tabular>
                    {line}
                  </Text>
                ))
              ) : (
                // Not "closed": nobody has recorded them.
                <Text variant="body" tone="secondary">
                  We do not have their hours. Worth calling before you go.
                </Text>
              )}
            </Section>

            <Section title="Menu">
              {menu === null ? (
                <ActivityIndicator color={c.accent} />
              ) : sections.length === 0 ? (
                <Text variant="body" tone="secondary">
                  We do not hold their menu yet.
                </Text>
              ) : (
                sections.map(({ key, items }) => {
                  const expanded = open[key];
                  const visible = expanded ? items : items.slice(0, PREVIEW);
                  return (
                    <View key={key} style={{ marginBottom: space.md }}>
                      <Text variant="footnote" tone="tint" weight="700" style={{ letterSpacing: 0.5, marginBottom: space.xs }}>
                        {(CATEGORY_LABEL[key] ?? key).toUpperCase()}
                      </Text>
                      {visible.map((item) => (
                        <View
                          key={item.id}
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            gap: space.md,
                            paddingVertical: space.xs,
                            borderBottomWidth: HAIRLINE,
                            borderBottomColor: c.border,
                          }}
                        >
                          <Text variant="body" style={{ flex: 1 }}>
                            {item.name}
                          </Text>
                          <Text variant="body" tone="secondary" tabular>
                            {ghs(item.price_ghs)}
                          </Text>
                        </View>
                      ))}
                      {items.length > PREVIEW ? (
                        <Pressable onPress={() => setOpen((o) => ({ ...o, [key]: !expanded }))} hitSlop={8}>
                          <Text variant="footnote" weight="600" style={{ color: c.accent, marginTop: space.sm }}>
                            {expanded ? "Show fewer" : `Show all ${items.length}`}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })
              )}
              {sections.length ? (
                <Text variant="caption1" tone="tertiary">
                  Menu prices. Some places add taxes or a service charge to the bill.
                </Text>
              ) : null}
            </Section>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="title3" style={{ marginBottom: space.xs }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        backgroundColor: pressed ? c.backgroundSunken : c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
      })}
    >
      <Symbol name={icon} size={14} color={c.accent} />
      <Text variant="footnote" weight="600">
        {label}
      </Text>
    </Pressable>
  );
}
