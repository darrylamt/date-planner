import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";
import { fetchMenu } from "../../lib/data";
import type { ItineraryOrder, MenuItem } from "../../lib/types";
import { NativeSheet } from "../native/NativeSheet";
import { SkeletonMenu } from "../Skeleton";
import { track } from "../../lib/signals";

/*
 * "activity" is its own category, not a kind of "other".
 *
 * Migration 0019 split it out so a go-kart, a game of bowling and twelve
 * minutes of laser tag stopped being priced like a course. Both menu drawers
 * kept the old five-category list, so the 56 rows that moved had nowhere to
 * render: an arcade's entire price list was invisible, and its label here
 * still promised activities that were being filtered out one line below.
 */
const CATEGORY_ORDER = ["starter", "main", "dessert", "drink", "activity", "other"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  starter: "Starters",
  main: "Mains",
  dessert: "Desserts",
  drink: "Drinks",
  activity: "Things to do",
  other: "Extras",
};

/**
 * Full menu for a stop, as a sheet. Tapping an item adds it to the order (or
 * bumps its quantity), so the running total updates behind the sheet.
 */
export function MenuSheet({
  visible,
  onClose,
  venueId,
  venueName,
  orders,
  onOrdersChange,
  only,
  planKey,
  occasion,
}: {
  planKey?: string;
  occasion?: string;
  visible: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  orders: ItineraryOrder[];
  onOrdersChange: (orders: ItineraryOrder[]) => void;
  /**
   * Show one category only.
   *
   * An arcade's price list and its kitchen are different questions, and
   * "Menu" is the wrong word for a game of bowling. The card opens this sheet
   * twice over, once for each, rather than making somebody scroll past the
   * burgers to find the lanes.
   */
  only?: (typeof CATEGORY_ORDER)[number];
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /*
   * Typed filter. Casa1715 lists 311 items and The Honeysuckle 182, so
   * changing one dish meant thumbing a price list until you gave up. The whole
   * menu is already loaded by the time this renders, so the search is local
   * and costs nothing per keystroke.
   */
  const [query, setQuery] = useState("");
  /*
   * The dish just added, for the line at the foot of the sheet. A tap on a
   * row used to change nothing on the sheet itself (the order is behind it),
   * so it was impossible to tell whether it had landed.
   */
  const [added, setAdded] = useState<{ name: string; qty: number; at: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setAdded(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded((a) => (a?.at === added.at ? null : a)), 1800);
    return () => clearTimeout(t);
  }, [added]);

  useEffect(() => {
    if (!visible || menu !== null || loading) return;
    setLoading(true);
    setFailed(false);
    fetchMenu(venueId)
      .then(setMenu)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [visible, venueId, menu, loading]);

  function addItem(item: MenuItem) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // What they choose to eat, for their own plans' taste (on the server).
    track("dish_added", venueId, { item: item.name, planKey, occasion });
    const unit = Number(item.price_ghs);
    const at = orders.findIndex((o) => o.item === item.name);
    setAdded({ name: item.name, qty: (at >= 0 ? orders[at].qty : 0) + 1, at: Date.now() });

    if (at >= 0) {
      const next = orders.map((o, i) =>
        i === at ? { ...o, qty: o.qty + 1, price_ghs: Math.round(unit * (o.qty + 1)) } : o
      );
      onOrdersChange(next);
      return;
    }
    onOrdersChange([...orders, { item: item.name, qty: 1, price_ghs: Math.round(unit) }]);
  }

  // Name and notes both: "vegetarian" and "serves two" live in notes, and are
  // exactly what somebody types when they are changing an order.
  const needle = query.trim().toLowerCase();
  const matching = needle
    ? (menu ?? []).filter(
        (m) =>
          m.name.toLowerCase().includes(needle) ||
          (m.notes ?? "").toLowerCase().includes(needle)
      )
    : (menu ?? []);

  const grouped = CATEGORY_ORDER.filter((cat) => !only || cat === only)
    .map((cat) => ({
      cat,
      items: matching.filter((m) => m.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  // A short menu is quicker to read than to search, so the box only appears
  // where it earns its space.
  const inScope = only ? (menu ?? []).filter((m) => m.category === only) : (menu ?? []);
  const searchable = inScope.length > 8;

  return (
    <NativeSheet visible={visible} onClose={onClose} detents={["medium", "large"]}>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {/* Sheet header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: GUTTER,
            paddingVertical: space.md,
            borderBottomWidth: HAIRLINE,
            borderBottomColor: c.border,
            backgroundColor: c.background,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="headline" numberOfLines={1}>
              {venueName}
            </Text>
            <Text variant="footnote" tone="secondary">
              {only === "activity" ? "Tap to add it to your plan" : "Tap to add to your order"}
            </Text>
          </View>
          <Button title="Done" kind="plain" size="medium" onPress={onClose} />
        </View>

        {searchable && (
          <View
            style={{
              paddingHorizontal: GUTTER,
              paddingVertical: space.sm,
              borderBottomWidth: HAIRLINE,
              borderBottomColor: c.border,
              backgroundColor: c.background,
            }}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${inScope.length} items`}
              placeholderTextColor={c.textSecondary}
              clearButtonMode="while-editing"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={`Search the menu at ${venueName}`}
              style={{
                backgroundColor: c.backgroundElement,
                borderRadius: radius.row,
                paddingHorizontal: space.md,
                minHeight: 40,
                color: c.text,
                fontSize: 17,
              }}
            />
          </View>
        )}

        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: space.lg, paddingBottom: insets.bottom + space.xxxl }}
        >
          {loading ? (
            <SkeletonMenu rows={8} />
          ) : failed ? (
            <Text variant="body" tone="secondary" center style={{ marginTop: space.xxxl }}>
              We could not load the menu. Check your connection and try again.
            </Text>
          ) : grouped.length === 0 ? (
            <Text variant="body" tone="secondary" center style={{ marginTop: space.xxxl }}>
              {needle
                ? `Nothing here matches “${query.trim()}”.`
                : only === "activity"
                  ? "We're working on getting their price list."
                  : "We're working on getting their menu."}
            </Text>
          ) : (
            grouped.map((g) => (
              <View key={g.cat} style={{ marginBottom: space.xl }}>
                <Text
                  variant="footnote"
                  tone="secondary"
                  style={{
                    paddingHorizontal: GUTTER + space.lg,
                    marginBottom: space.sm,
                    textTransform: "uppercase",
                  }}
                >
                  {CATEGORY_LABEL[g.cat]}
                </Text>

                <View
                  style={{
                    backgroundColor: c.backgroundElement,
                    borderRadius: radius.row,
                    marginHorizontal: GUTTER,
                    overflow: "hidden",
                  }}
                >
                  {g.items.map((item, i) => {
                    const inOrder = orders.find((o) => o.item === item.name)?.qty ?? 0;
                    return (
                    <Pressable
                      key={item.id}
                      onPress={() => addItem(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}, ${ghs(Number(item.price_ghs))}${inOrder ? `, ${inOrder} in your order` : ""}`}
                      accessibilityHint="Adds one to your order"
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? c.accentBorder : inOrder ? c.accentSoft : "transparent",
                        borderTopWidth: i === 0 ? 0 : HAIRLINE,
                        borderTopColor: c.border,
                      })}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: space.md,
                          paddingHorizontal: space.lg,
                          paddingVertical: space.md,
                          minHeight: 44,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text variant="body">{item.name}</Text>
                          {item.notes ? (
                            <Text variant="footnote" tone="secondary">
                              {item.notes}
                            </Text>
                          ) : null}
                          {/*
                            Attributed, because the wording is the menu's and
                            not ours. "Vegetarian" printed by the kitchen is a
                            different thing from us having decided a dish looks
                            vegetarian, and only the first is worth showing.
                          */}
                          {item.dietary_note ? (
                            <Text variant="footnote" tone="tertiary">
                              Menu says: {item.dietary_note}
                            </Text>
                          ) : null}
                        </View>
                        <Text variant="body" tone="secondary" tabular>
                          {ghs(Number(item.price_ghs))}
                        </Text>
                        {/* In the order: a tick and how many, so a tap visibly lands. */}
                        {inOrder ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 3,
                              minWidth: 44,
                              justifyContent: "center",
                              paddingHorizontal: space.sm,
                              paddingVertical: 3,
                              borderRadius: 999,
                              backgroundColor: c.accent,
                            }}
                          >
                            <Symbol name="checkmark" size={12} weight="bold" color={c.textOnBrand} />
                            <Text variant="footnote" weight="700" tabular style={{ color: c.textOnBrand }}>
                              {inOrder}
                            </Text>
                          </View>
                        ) : (
                          <Symbol name="plus.circle.fill" size={24} color={c.accent} />
                        )}
                      </View>
                    </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* What the last tap did, at the foot of the sheet, for a moment. */}
        {added ? (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={{
              position: "absolute",
              left: GUTTER,
              right: GUTTER,
              bottom: insets.bottom + space.md,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.row,
              backgroundColor: c.text,
            }}
          >
            <Symbol name="checkmark.circle.fill" size={18} color={c.background} />
            <Text variant="subheadline" weight="600" numberOfLines={1} style={{ flex: 1, color: c.background }}>
              Added {added.name}
            </Text>
            <Text variant="footnote" style={{ color: c.background, opacity: 0.8 }}>
              {added.qty} in your order
            </Text>
          </View>
        ) : null}
      </View>
    </NativeSheet>
  );
}
