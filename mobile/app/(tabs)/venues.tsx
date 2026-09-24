import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER, HAIRLINE, radius, space, TAB_BAR } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { ghs } from "../../src/lib/format";
import { listVenues, type VenueListing } from "../../src/lib/data";
import { VENUE_KIND } from "../../src/lib/venueKinds";

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
    const needle = query.trim().toLowerCase();
    return venues.filter((v) => {
      if (types && !types.includes(v.type)) return false;
      if (!needle) return true;
      /*
       * Name, neighbourhood, kitchen and feel, because those are the four
       * things people type: "Honeysuckle", "Osu", "korean", "rooftop".
       */
      return (
        v.name.toLowerCase().includes(needle) ||
        (v.area ?? "").toLowerCase().includes(needle) ||
        (v.city ?? "").toLowerCase().includes(needle) ||
        v.cuisines.some((x) => x.toLowerCase().includes(needle)) ||
        v.vibe_tags.some((x) => x.toLowerCase().includes(needle))
      );
    });
  }, [venues, query, filter]);

  const header = (
    <View style={{ paddingTop: insets.top + space.lg, gap: space.md, paddingBottom: space.md }}>
      <Text variant="display" style={{ paddingHorizontal: GUTTER }}>
        Venues
      </Text>

      <View
        style={{
          marginHorizontal: GUTTER,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          height: 44,
          paddingHorizontal: space.md,
          borderRadius: radius.row,
          backgroundColor: c.backgroundElement,
          borderWidth: HAIRLINE,
          borderColor: c.border,
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
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                borderRadius: radius.pill,
                backgroundColor: on ? c.accent : c.backgroundElement,
                borderWidth: HAIRLINE,
                borderColor: on ? c.accent : c.border,
              }}
            >
              <Text variant="footnote" weight="600" tone={on ? "onTint" : "label"}>
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
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: TAB_BAR.clearance }}
      ItemSeparatorComponent={() => (
        <View style={{ height: HAIRLINE, backgroundColor: c.border, marginLeft: GUTTER + 64 + space.md }} />
      )}
      ListEmptyComponent={
        !venues && !failed ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: space.xl }} />
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
      renderItem={({ item: v }) => (
        <Pressable
          onPress={() => router.push(`/venue/${v.id}`)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            paddingHorizontal: GUTTER,
            paddingVertical: space.sm,
            backgroundColor: pressed ? c.backgroundSunken : "transparent",
          })}
        >
          {v.image_url ? (
            <Image
              source={{ uri: v.image_url }}
              style={{ width: 64, height: 64, borderRadius: radius.row, backgroundColor: c.skeleton }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.row,
                backgroundColor: c.backgroundSunken,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Symbol name="building.2" size={22} color={c.textTertiary} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="headline" numberOfLines={1}>
              {v.name}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {[VENUE_KIND[v.type] ?? v.type, v.area].filter(Boolean).join(" · ")}
            </Text>
            {v.avg_cost_per_person_ghs ? (
              <Text variant="footnote" tone="tertiary" tabular>
                About {ghs(v.avg_cost_per_person_ghs)} a head
              </Text>
            ) : null}
          </View>
          <Symbol name="chevron.right" size={13} color={c.textTertiary} />
        </Pressable>
      )}
    />
  );
}
