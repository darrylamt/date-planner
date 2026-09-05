import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
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

const CATEGORY_ORDER = ["starter", "main", "dessert", "drink", "other"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  starter: "Starters",
  main: "Mains",
  dessert: "Desserts",
  drink: "Drinks",
  other: "Extras & activities",
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
}: {
  visible: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  orders: ItineraryOrder[];
  onOrdersChange: (orders: ItineraryOrder[]) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

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

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: (menu ?? []).filter((m) => m.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.groupedBackground }}>
        {/* Sheet header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: GUTTER,
            paddingVertical: space.md,
            borderBottomWidth: HAIRLINE,
            borderBottomColor: c.separator,
            backgroundColor: c.background,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="headline" numberOfLines={1}>
              {venueName}
            </Text>
            <Text variant="footnote" tone="secondary">
              Tap to add to your order
            </Text>
          </View>
          <Button title="Done" kind="plain" size="medium" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={{ paddingVertical: space.lg, paddingBottom: insets.bottom + space.xxxl }}>
          {loading ? (
            <ActivityIndicator style={{ marginTop: space.xxxl }} color={c.tint} />
          ) : failed ? (
            <Text variant="body" tone="secondary" center style={{ marginTop: space.xxxl }}>
              We could not load the menu. Check your connection and try again.
            </Text>
          ) : grouped.length === 0 ? (
            <Text variant="body" tone="secondary" center style={{ marginTop: space.xxxl }}>
              No menu on file for this spot yet.
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
                    backgroundColor: c.surface,
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
                        backgroundColor: pressed ? c.fillSecondary : "transparent",
                        borderTopWidth: i === 0 ? 0 : HAIRLINE,
                        borderTopColor: c.separator,
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
