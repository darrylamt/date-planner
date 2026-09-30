import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { StopGallery } from "../../src/components/plan/StopGallery";
import { Paywall } from "../../src/components/chat/Paywall";
import { ItemSheet, availability } from "../../src/components/venue/ItemSheet";
import { GUTTER, HAIRLINE, radius, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { ghs, instagramUrl, uberRideLink } from "../../src/lib/format";
import { PLACEHOLDER_AVG_GHS } from "../../src/lib/budget";
import { OCCASIONS } from "../../src/lib/planConstants";
import { fetchMenu, fetchMyRecommendations, fetchVenue, setRecommendation, type VenueDetail } from "../../src/lib/data";
import { Alert } from "react-native";
import { router } from "expo-router";
import { fetchAllowance } from "../../src/lib/chat";
import { useAuth } from "../../src/lib/useAuth";
import { VENUE_KIND } from "../../src/lib/venueKinds";
import type { MenuItem } from "../../src/lib/types";
import type { SymbolViewProps } from "expo-symbols";

const CATEGORY_LABEL: Record<string, string> = {
  main: "Mains",
  starter: "Starters",
  dessert: "Desserts",
  drink: "Drinks",
  activity: "Things to do",
  other: "Extras",
};
/* An activity venue's list leads with what you do there, not with its snacks. */
const FOOD_ORDER = ["main", "starter", "dessert", "drink", "activity", "other"];
const ACTIVITY_ORDER = ["activity", "other", "main", "starter", "dessert", "drink"];
/** Past this many items the menu gets a search box. */
const SEARCHABLE = 20;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BEST_FOR_LABEL: Record<string, string> = {
  ...Object.fromEntries(OCCASIONS.map((o) => [o.id, o.title])),
  casual_hangout: "Casual hangout",
};

/** A Ghanaian number in the form wa.me wants. */
function waNumber(raw: string | null): string | null {
  const d = raw?.replace(/\D/g, "") ?? "";
  if (!d) return null;
  if (d.startsWith("0") && d.length === 10) return `233${d.slice(1)}`;
  return d.length >= 10 ? d : null;
}

/**
 * One venue, in full.
 *
 * Laid out in the order people use it: is this the place (pictures, name,
 * what it is, what it costs, open today), how do I get or book it (one row of
 * buttons), what is it like (a line of chips), and what do I order (the menu,
 * by category, each item opening its own sheet). Hours fold into one line
 * with the week behind it.
 *
 * The top is free for everybody: pictures, name, kind, price, rating, hours
 * today, the description, and the map and Uber buttons, because that is what
 * the list already promised and getting there is not a premium feature. Pro
 * opens the rest: the menu with prices and details, calling, booking and
 * messaging, and the notes on who it suits.
 *
 * Reviews and "most liked" arrive with the recommendations that fill them;
 * an empty heading is a promise the page cannot keep.
 */
export default function VenuePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [venue, setVenue] = useState<VenueDetail | null | undefined>(undefined);
  const [pro, setPro] = useState<boolean | null>(null);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hoursOpen, setHoursOpen] = useState(false);
  const [item, setItem] = useState<MenuItem | null>(null);
  // Item -> whether this account's recommendation counts publicly.
  const [mine, setMine] = useState<Map<string, boolean>>(new Map());

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

  useEffect(() => {
    if (!pro || menu) return;
    let active = true;
    fetchMenu(id)
      .then((m) => {
        if (!active) return;
        setMenu(m);
        void fetchMyRecommendations(m.map((x) => x.id)).then((s) => active && setMine(s));
      })
      .catch(() => active && setMenu([]));
    return () => {
      active = false;
    };
  }, [pro, id, menu]);

  /*
   * Shown straight away and put back if the database says no: waiting on a
   * round trip before a thumb lights up reads as the tap not having landed.
   */
  async function recommend(target: MenuItem, on: boolean) {
    const wasCounted = mine.get(target.id) ?? false;
    const apply = (mark: boolean | null, countDelta: number) => {
      const fix = (m: MenuItem) =>
        m.id === target.id ? { ...m, recommend_count: Math.max(0, (m.recommend_count ?? 0) + countDelta) } : m;
      if (countDelta) {
        setMenu((cur) => (cur ? cur.map(fix) : cur));
        setItem((cur) => (cur ? fix(cur) : cur));
      }
      setMine((cur) => {
        const next = new Map(cur);
        if (mark === null) next.delete(target.id);
        else next.set(target.id, mark);
        return next;
      });
    };
    // Lit straight away; the count only moves once the database says it counts.
    apply(on ? false : null, on ? 0 : wasCounted ? -1 : 0);
    const result = await setRecommendation(target.id, id, on);
    if (result === "counted") return apply(true, 1);
    if (result === "favourite") {
      Alert.alert(
        "Saved to your favourites",
        "Recommendations count toward the public number once you have planned a visit here, so the number only reflects people who went. Plan a visit, then recommend it after."
      );
      return;
    }
    if (result === "removed") return;
    // Put back what was there.
    apply(on ? null : wasCounted, on ? 0 : wasCounted ? 1 : 0);
    if (result === "account") {
      Alert.alert("Sign in to recommend", "Recommendations come from accounts, one each, so the counts stay honest.", [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => router.push("/login") },
      ]);
    } else {
      Alert.alert("Could not save that", "Try again in a moment.");
    }
  }

  const isActivity = venue?.type === "activity" || venue?.type === "outdoor";

  const categories = useMemo(() => {
    const order = isActivity ? ACTIVITY_ORDER : FOOD_ORDER;
    const present = new Set((menu ?? []).map((m) => m.category));
    return order.filter((k) => present.has(k as MenuItem["category"]));
  }, [menu, isActivity]);

  const current = tab && categories.includes(tab) ? tab : categories[0] ?? null;
  // What people here liked, across the whole menu: the answer to "what should I get".
  const liked = useMemo(
    () =>
      (menu ?? [])
        .filter((m) => (m.recommend_count ?? 0) > 0)
        .sort((a, b) => (b.recommend_count ?? 0) - (a.recommend_count ?? 0))
        .slice(0, 8),
    [menu]
  );
  const needle = query.trim().toLowerCase();
  /*
   * A search looks through the whole menu, not just the open tab: somebody
   * typing "jollof" should not have to guess which heading it sits under.
   */
  const shown = useMemo(() => {
    const all = menu ?? [];
    const list = needle
      ? all.filter((m) => m.name.toLowerCase().includes(needle) || (m.notes ?? "").toLowerCase().includes(needle))
      : all.filter((m) => m.category === current);
    return [...list].sort((a, b) => Number(a.price_ghs) - Number(b.price_ghs));
  }, [menu, needle, current]);

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
  const whatsapp = waNumber(venue.whatsapp_phone);
  const maps =
    venue.google_maps_url ??
    `https://maps.apple.com/?q=${encodeURIComponent(`${venue.name} ${venue.area ?? ""} ${venue.city ?? "Accra"}`)}`;
  const perHead =
    venue.avg_cost_per_person_ghs && venue.avg_cost_per_person_ghs !== PLACEHOLDER_AVG_GHS
      ? venue.avg_cost_per_person_ghs
      : null;

  // Google's weekly lines read "Monday: 9:00 AM – 10:00 PM"; today's is the headline.
  const todayName = WEEKDAYS[new Date().getDay()];
  const todayLine = venue.opening_hours_text?.find((l) => l.startsWith(todayName));
  const todayHours = todayLine ? todayLine.slice(todayLine.indexOf(":") + 1).trim() : null;

  const actions: { icon: SymbolViewProps["name"]; label: string; onPress: () => void; pro?: boolean }[] = [];
  if (dial) actions.push({ icon: "phone.fill", label: "Call", onPress: () => void Linking.openURL(`tel:${dial}`), pro: true });
  if (venue.booking_url)
    actions.push({ icon: "calendar.badge.plus", label: "Book", onPress: () => void Linking.openURL(venue.booking_url!), pro: true });
  else if (whatsapp)
    actions.push({ icon: "message.fill", label: "WhatsApp", onPress: () => void Linking.openURL(`https://wa.me/${whatsapp}`), pro: true });
  actions.push({ icon: "map.fill", label: "Directions", onPress: () => void Linking.openURL(maps) });
  actions.push({ icon: "car.fill", label: "Uber", onPress: () => void Linking.openURL(uberRideLink(venue)) });
  if (instagram) actions.push({ icon: "camera.fill", label: "Instagram", onPress: () => void Linking.openURL(instagram), pro: true });
  const usable = actions.filter((a) => !a.pro || pro);

  const chips: { icon: SymbolViewProps["name"]; text: string }[] = [];
  for (const b of venue.best_for) chips.push({ icon: "heart", text: BEST_FOR_LABEL[b] ?? b.replace(/_/g, " ") });
  for (const t of venue.vibe_tags.slice(0, 4)) chips.push({ icon: "sparkles", text: t[0].toUpperCase() + t.slice(1) });
  for (const k of venue.cuisines) chips.push({ icon: "fork.knife", text: k[0].toUpperCase() + k.slice(1) });
  if (venue.dress_code) chips.push({ icon: "tshirt", text: venue.dress_code });
  if (venue.max_party_size) chips.push({ icon: "person.3", text: `Groups up to ${venue.max_party_size}` });
  if (venue.reservation_required) chips.push({ icon: "calendar", text: "Book ahead" });
  // Only what somebody asked the venue. Null is "nobody has asked", not "no".
  if (venue.has_vegetarian_options === true) chips.push({ icon: "leaf", text: "Vegetarian options" });

  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {images.length ? <StopGallery images={images} alt={venue.name} /> : null}

        {/* ── Is this the place ── */}
        <View style={{ paddingHorizontal: GUTTER, paddingTop: space.lg, gap: space.xs }}>
          <Text variant="eyebrow" tone="tint" uppercase>
            {[VENUE_KIND[venue.type] ?? venue.type, venue.area].filter(Boolean).join(" · ")}
          </Text>
          <Text variant="largeTitle">{venue.name}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm }}>
            {perHead ? <Pill icon="banknote" text={`About ${ghs(perHead)} a head`} /> : null}
            {venue.place_rating ? (
              <Pill
                icon="star.fill"
                text={`${venue.place_rating.toFixed(1)}${venue.place_rating_count ? ` (${venue.place_rating_count.toLocaleString()})` : ""}`}
              />
            ) : null}
            {todayHours ? <Pill icon="clock" text={`Today ${todayHours}`} /> : null}
          </View>
        </View>

        {/* ── Get there, book it ── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            marginHorizontal: GUTTER,
            marginTop: space.lg,
            paddingVertical: space.md,
            borderRadius: radius.card,
            backgroundColor: c.backgroundElement,
          }}
        >
          {usable.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed }) => ({ alignItems: "center", gap: space.xs, minWidth: 56, opacity: pressed ? 0.6 : 1 })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Symbol name={a.icon} size={19} color={c.accent} />
              </View>
              <Text variant="caption" tone="secondary">
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {venue.description ? (
          <Text variant="body" style={{ paddingHorizontal: GUTTER, marginTop: space.lg }}>
            {venue.description}
          </Text>
        ) : null}

        {pro === null ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: space.xl }} />
        ) : !pro ? (
          <View style={{ paddingHorizontal: GUTTER, gap: space.md, marginTop: space.xl }}>
            {/* The list of what is behind it, because "Unlock" alone asks somebody to pay for a surprise. */}
            <View style={{ padding: space.lg, borderRadius: radius.card, backgroundColor: c.backgroundElement, gap: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Symbol name="lock.fill" size={15} color={c.accent} />
                <Text variant="headline">The full page is part of aduro Pro</Text>
              </View>
              {[
                "The whole menu, with prices and what is in each dish",
                "Call, book or message them in a tap",
                "Opening hours for the week",
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
          <>
            {/* ── What it is like ── */}
            {chips.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: GUTTER, marginTop: space.lg }}>
                {chips.map((ch) => (
                  <Pill key={ch.text} icon={ch.icon} text={ch.text} quiet />
                ))}
              </View>
            ) : null}

            {/* ── What to order ── */}
            <View style={{ marginTop: space.xl }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  paddingHorizontal: GUTTER,
                }}
              >
                <Text variant="title2">{isActivity ? "Prices" : "Menu"}</Text>
                {menu?.length ? (
                  <Text variant="footnote" tone="secondary">
                    {menu.length} item{menu.length === 1 ? "" : "s"}
                  </Text>
                ) : null}
              </View>

              {menu === null ? (
                <ActivityIndicator color={c.accent} style={{ marginTop: space.lg }} />
              ) : menu.length === 0 ? (
                <Text variant="body" tone="secondary" style={{ paddingHorizontal: GUTTER, marginTop: space.sm }}>
                  We do not hold their menu yet.
                </Text>
              ) : (
                <>
                  {liked.length && !needle ? (
                    <View style={{ marginTop: space.md }}>
                      <Text variant="eyebrow" tone="secondary" uppercase style={{ paddingHorizontal: GUTTER }}>
                        Most recommended
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.sm, paddingTop: space.sm }}
                      >
                        {liked.map((m) => (
                          <Pressable
                            key={m.id}
                            onPress={() => setItem(m)}
                            style={({ pressed }) => ({
                              width: 150,
                              borderRadius: radius.card,
                              backgroundColor: c.backgroundElement,
                              overflow: "hidden",
                              opacity: pressed ? 0.7 : 1,
                            })}
                          >
                            {m.image_url ? (
                              <Image source={{ uri: m.image_url }} style={{ width: 150, height: 96 }} contentFit="cover" />
                            ) : null}
                            <View style={{ padding: space.md, gap: 2 }}>
                              <Text variant="footnote" weight="600" numberOfLines={2}>
                                {m.name}
                              </Text>
                              <Text variant="footnote" tabular>
                                {ghs(Number(m.price_ghs))}
                              </Text>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Symbol name="hand.thumbsup.fill" size={11} color={c.accent} />
                                <Text variant="caption" tone="tint">
                                  {m.recommend_count}
                                </Text>
                              </View>
                            </View>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  {menu.length > SEARCHABLE ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.sm,
                        marginHorizontal: GUTTER,
                        marginTop: space.md,
                        height: 40,
                        paddingHorizontal: space.md,
                        borderRadius: radius.row,
                        backgroundColor: c.backgroundElement,
                      }}
                    >
                      <Symbol name="magnifyingglass" size={15} color={c.textSecondary} />
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={`Search ${menu.length} items`}
                        placeholderTextColor={c.textSecondary}
                        clearButtonMode="while-editing"
                        autoCorrect={false}
                        returnKeyType="search"
                        style={{ flex: 1, color: c.text, fontSize: 16 }}
                      />
                    </View>
                  ) : null}

                  {!needle && categories.length > 1 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.sm, paddingTop: space.md }}
                    >
                      {categories.map((k) => {
                        const on = k === current;
                        const n = menu.filter((m) => m.category === k).length;
                        return (
                          <Pressable
                            key={k}
                            onPress={() => setTab(k)}
                            accessibilityState={{ selected: on }}
                            style={{
                              paddingHorizontal: space.md,
                              paddingVertical: space.sm,
                              borderRadius: radius.pill,
                              backgroundColor: on ? c.accent : c.backgroundElement,
                            }}
                          >
                            <Text variant="footnote" weight="600" tone={on ? "onTint" : "label"}>
                              {CATEGORY_LABEL[k] ?? k} {n}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : null}

                  <View style={{ marginTop: space.sm }}>
                    {shown.map((m, i) => (
                      <MenuRow key={m.id} item={m} first={i === 0} onPress={() => setItem(m)} />
                    ))}
                    {needle && !shown.length ? (
                      <Text variant="body" tone="secondary" style={{ paddingHorizontal: GUTTER, marginTop: space.md }}>
                        Nothing on the menu matches “{query.trim()}”.
                      </Text>
                    ) : null}
                  </View>

                  <Text variant="caption" tone="tertiary" style={{ paddingHorizontal: GUTTER, marginTop: space.md }}>
                    Menu prices. Some places add taxes or a service charge to the bill.
                  </Text>
                </>
              )}
            </View>

            {/* ── Hours, folded ── */}
            <Pressable
              onPress={() => setHoursOpen(!hoursOpen)}
              disabled={!venue.opening_hours_text?.length}
              style={{
                marginHorizontal: GUTTER,
                marginTop: space.xl,
                padding: space.lg,
                borderRadius: radius.card,
                backgroundColor: c.backgroundElement,
                gap: space.sm,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Symbol name="clock" size={16} color={c.accent} />
                <Text variant="headline" style={{ flex: 1 }}>
                  {venue.opening_hours_text?.length ? (todayHours ? `Today ${todayHours}` : "Opening hours") : "Hours"}
                </Text>
                {venue.opening_hours_text?.length ? (
                  <Symbol name={hoursOpen ? "chevron.up" : "chevron.down"} size={13} color={c.textTertiary} />
                ) : null}
              </View>
              {!venue.opening_hours_text?.length ? (
                // Not "closed": nobody has recorded them.
                <Text variant="footnote" tone="secondary">
                  We do not have their hours. Worth calling before you go.
                </Text>
              ) : hoursOpen ? (
                venue.opening_hours_text.map((line) => {
                  const [day, ...rest] = line.split(":");
                  const today = day === todayName;
                  return (
                    <View key={line} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                      <Text variant="footnote" weight={today ? "700" : "400"}>
                        {day}
                      </Text>
                      <Text variant="footnote" tone={today ? "label" : "secondary"} weight={today ? "700" : "400"} tabular>
                        {rest.join(":").trim()}
                      </Text>
                    </View>
                  );
                })
              ) : null}
            </Pressable>
          </>
        )}
      </ScrollView>

      <ItemSheet
        item={item}
        venueName={venue.name}
        onClose={() => setItem(null)}
        recommended={item ? mine.has(item.id) : false}
        favouriteOnly={item ? mine.get(item.id) === false : false}
        onRecommend={item ? (on) => void recommend(item, on) : undefined}
      />
    </>
  );
}

/** One line on the menu: name, the start of its description, when it applies, the price. */
function MenuRow({ item, first, onPress }: { item: MenuItem; first: boolean; onPress: () => void }) {
  const c = useTheme();
  const when = availability(item);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${ghs(Number(item.price_ghs))}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingHorizontal: GUTTER,
        paddingVertical: space.md,
        borderTopWidth: first ? 0 : HAIRLINE,
        borderTopColor: c.border,
        backgroundColor: pressed ? c.backgroundSunken : "transparent",
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight="600">
          {item.name}
        </Text>
        {item.notes ? (
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            {item.notes}
          </Text>
        ) : null}
        {when ? (
          <Text variant="caption" tone="tint">
            {when}
          </Text>
        ) : null}
        {(item.recommend_count ?? 0) > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Symbol name="hand.thumbsup.fill" size={11} color={c.accent} />
            <Text variant="caption" tone="tint">
              Recommended by {item.recommend_count} who went
            </Text>
          </View>
        ) : null}
        <Text variant="callout" tabular style={{ marginTop: 2 }}>
          {ghs(Number(item.price_ghs))}
        </Text>
      </View>
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={{ width: 72, height: 72, borderRadius: radius.row, backgroundColor: c.skeleton }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <Symbol name="chevron.right" size={12} color={c.textTertiary} />
    </Pressable>
  );
}

function Pill({ icon, text, quiet }: { icon: SymbolViewProps["name"]; text: string; quiet?: boolean }) {
  const c = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: space.md,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: quiet ? "transparent" : c.backgroundElement,
        borderWidth: quiet ? HAIRLINE : 0,
        borderColor: c.border,
      }}
    >
      <Symbol name={icon} size={12} color={quiet ? c.textSecondary : c.accent} />
      <Text variant="footnote" tone={quiet ? "secondary" : "label"}>
        {text}
      </Text>
    </View>
  );
}
