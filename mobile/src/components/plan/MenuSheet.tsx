import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
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
}: {
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

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

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
    const unit = Number(item.price_ghs);
    const at = orders.findIndex((o) => o.item === item.name);

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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
            <ActivityIndicator style={{ marginTop: space.xxxl }} color={c.accent} />
          ) : failed ? (
            <Text variant="body" tone="secondary" center style={{ marginTop: space.xxxl }}>
              We could not load the menu. Check your connection and try again.
            </Text>
          ) : grouped.length === 0 ? (
            <Text variant="body" tone="secondary" center style={{ marginTop: space.xxxl }}>
              {needle
                ? `Nothing here matches “${query.trim()}”.`
                : only === "activity"
                  ? "No price list on file for this spot yet."
                  : "No menu on file for this spot yet."}
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
                  {g.items.map((item, i) => (
                    <Pressable
                      key={item.id}
                      onPress={() => addItem(item)}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? c.backgroundSunken : "transparent",
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
                        <Symbol name="plus.circle.fill" size={22} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
