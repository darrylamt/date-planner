import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER, HAIRLINE, radius, space, TAB_BAR } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { ghs } from "../../src/lib/format";
import { PLACEHOLDER_AVG_GHS } from "../../src/lib/budget";
import { listVenues, type VenueListing } from "../../src/lib/data";
import { VENUE_KIND } from "../../src/lib/venueKinds";
import { SkeletonRows } from "../../src/components/Skeleton";
import { fold } from "../../src/lib/fold";
import { record } from "../../src/lib/usage";
import { Body, Display, KenteBand } from "../../src/components/look";
import { useLook } from "../../src/lib/appearance";

/*
 * Kinds as people browse them, which is not quite how they are stored:
 * "things to do" is both activity and outdoor, because nobody looking for
 * something to do cares which column it sits in.
 */
const FILTERS: { label: string; types: string[] | null }[] = [
  { label: "All", types: null },
  { label: "Restaurants", types: ["restaurant"] },
  { label: "Bars", types: ["lounge"] },
  { label: "Cafés", types: ["cafe"] },
  { label: "Dessert", types: ["dessert"] },
  { label: "Things to do", types: ["activity", "outdoor"] },
  { label: "Spas", types: ["wellness"] },
];

/**
 * Every place we hold, searchable.
 *
 * Browsing is free and so is every row here; the page behind a row is what
 * Pro unlocks. A tab you cannot use without paying is an advert sitting in
 * the navigation, and a list you can search until the one place you want is
 * a reason to pay at the moment it is worth something.
 */
export default function Venues() {
  const c = useTheme();
  const look = useLook();
  const { width } = useWindowDimensions();
  // Two photo cards a row (redesign, 3 Nov 2026).
  const cardW = (width - GUTTER * 2 - 12) / 2;
  const insets = useSafeAreaInsets();
  const [venues, setVenues] = useState<VenueListing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(0);

  useEffect(() => {
    let active = true;
    listVenues()
      .then((v) => active && setVenues(v))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (!venues) return [];
    const types = FILTERS[filter].types;
    const needle = fold(query.trim());
    return venues.filter((v) => {
      if (types && !types.includes(v.type)) return false;
      if (!needle) return true;
      /*
       * Name, neighbourhood, kitchen and feel, because those are the four
       * things people type: "Honeysuckle", "Osu", "korean", "rooftop".
       */
      return (
        fold(v.name).includes(needle) ||
        fold(v.area ?? "").includes(needle) ||
        fold(v.city ?? "").includes(needle) ||
        v.cuisines.some((x) => fold(x).includes(needle)) ||
        v.vibe_tags.some((x) => fold(x).includes(needle))
      );
    });
  }, [venues, query, filter]);

  /*
   * What people look for, once they stop typing (usage_events, 0097): the
   * words, the kind chip, and how many places we hold that match. A search
   * that finds nothing is a venue to sign.
   */
  const needle = query.trim();
  useEffect(() => {
    if (!venues || needle.length < 2) return;
    const t = setTimeout(
      () => record("search", { name: needle, value: shown.length, data: { where: "venues_tab", kind: FILTERS[filter].label } }),
      1500
    );
    return () => clearTimeout(t);
  }, [needle, filter, venues, shown.length]);

  const open = (id: string, index: number) => {
    record("venue_opened", {
      name: id,
      value: index,
      data: { from: needle ? "search" : "browse", kind: FILTERS[filter].label, ...(needle ? { query: needle } : {}) },
    });
    router.push(`/venue/${id}`);
  };

  const header = (
    <View style={{ paddingTop: insets.top, gap: space.md, paddingBottom: space.md }}>
      <KenteBand />
      <Text variant="display" style={{ paddingHorizontal: GUTTER, marginTop: space.sm }}>
        Venues
      </Text>

      <View
        style={{
          marginHorizontal: GUTTER,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          height: 52,
          paddingHorizontal: space.lg,
          borderRadius: 26,
          backgroundColor: look.tile,
          borderWidth: 1,
          borderColor: look.tileEdge,
        }}
      >
        <Symbol name="magnifyingglass" size={16} color={c.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="A name, an area, a cuisine"
          placeholderTextColor={c.textSecondary}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={{ flex: 1, color: c.text, fontSize: 17 }}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.sm }}
      >
        {FILTERS.map((f, i) => {
          const on = i === filter;
          return (
            <Pressable
              key={f.label}
              onPress={() => setFilter(i)}
              accessibilityState={{ selected: on }}
              style={{
                paddingHorizontal: space.lg,
                height: 38,
                justifyContent: "center",
                borderRadius: 19,
                backgroundColor: on ? look.primary : "transparent",
                borderWidth: 1,
                borderColor: on ? look.primary : look.tileEdge,
              }}
            >
              <Text variant="footnote" weight="600" style={{ color: on ? look.onPrimary : c.text }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.background }}
      data={shown}
      keyExtractor={(v) => v.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: GUTTER }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: TAB_BAR.clearance, gap: 18 }}
      ListEmptyComponent={
        !venues && !failed ? (
          <SkeletonRows rows={8} />
        ) : (
          <Text variant="body" tone="secondary" center style={{ marginTop: space.xl, paddingHorizontal: GUTTER }}>
            {failed
              ? "We could not load the venues just now."
              : query
                ? `Nothing we hold matches “${query.trim()}”.`
                : "Nothing of this kind yet."}
          </Text>
        )
      }
      renderItem={({ item: v, index }) => (
        <Pressable
          onPress={() => open(v.id, index)}
          accessibilityRole="button"
          accessibilityLabel={`${v.name}, ${[VENUE_KIND[v.type] ?? v.type, v.area].filter(Boolean).join(", ")}`}
          style={({ pressed }) => ({ width: cardW, gap: 8, transform: [{ scale: pressed ? 0.97 : 1 }] })}
        >
          {v.image_url ? (
            <Image
              source={{ uri: v.image_url }}
              style={{ width: cardW, height: cardW * 1.08, borderRadius: 22, backgroundColor: c.skeleton }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View
              style={{
                width: cardW,
                height: cardW * 1.08,
                borderRadius: 22,
                backgroundColor: look.tile,
                borderWidth: 1,
                borderColor: look.tileEdge,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Symbol name="building.2" size={28} color={c.textTertiary} />
            </View>
          )}
          <View style={{ gap: 1, paddingHorizontal: 2 }}>
            <Display size={16} weight="700" numberOfLines={2}>
              {v.name}
            </Display>
            <Body size={13} tone="secondary" numberOfLines={1}>
              {[VENUE_KIND[v.type] ?? v.type, v.area].filter(Boolean).join(" · ")}
            </Body>
            {/* Not the GHS 100 import default: that is no price at all. */}
            {v.avg_cost_per_person_ghs && v.avg_cost_per_person_ghs !== PLACEHOLDER_AVG_GHS ? (
              <Body size={13} weight="600" color={look.colors.accent}>
                {`About ${ghs(v.avg_cost_per_person_ghs)} a head`}
              </Body>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}
