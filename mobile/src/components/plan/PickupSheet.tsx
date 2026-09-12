import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space, type as typeScale } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";
import { fetchPickups } from "../../lib/api";
import { leadTimeLabel, type GiftVendor, type PickupChoice } from "../../lib/pickups";

/**
 * Pick up flowers or a cake on the way.
 *
 * Image-led on purpose. Nobody chooses flowers from a list of names, and a
 * cake is bought with the eyes before the price is even read, so the
 * photograph is the control and the text underneath is confirmation.
 *
 * Everything offered here can actually be had in time: the server has already
 * dropped vendors whose lead time is longer than the gap between now and the
 * evening, so a two-day cake never appears for tonight.
 */
const COLOURS = [
  { label: "White", hex: "#F5F5F5" },
  { label: "Pink", hex: "#F48FB1" },
  { label: "Red", hex: "#D32F2F" },
  { label: "Blue", hex: "#42A5F5" },
  { label: "Gold", hex: "#D4AF37" },
  { label: "Chocolate", hex: "#5D4037" },
];

export function PickupSheet({
  visible,
  onClose,
  occasion,
  date,
  startTime,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  occasion: string;
  date: string;
  startTime: string;
  onChoose: (choice: PickupChoice) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  const [vendors, setVendors] = useState<GiftVendor[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [colour, setColour] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || vendors !== null || loading) return;
    setLoading(true);
    void fetchPickups(occasion, date, startTime)
      .then(setVendors)
      .catch(() => setVendors([]))
      .finally(() => setLoading(false));
  }, [visible, vendors, loading, occasion, date, startTime]);

  const allProducts = (vendors ?? []).flatMap((v) =>
    v.products.map((p) => ({ ...p, vendor: v }))
  );
  const product = allProducts.find((p) => p.id === productId) ?? null;
  const variant = product?.variants.find((x) => x.id === variantId) ?? null;
  const isCake = product?.vendor.kind === "cake";

  function reset() {
    setProductId(null);
    setVariantId(null);
    setQuantity(1);
    setMessage("");
    setColour(null);
  }

  function confirm() {
    if (!product || !variant) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChoose({
      variantId: variant.id,
      vendorName: product.vendor.name,
      productName: product.name,
      variantLabel: variant.label,
      kind: product.vendor.kind,
      quantity,
      priceGhs: variant.price_ghs,
      message: isCake && message.trim() ? message.trim() : undefined,
      colour: isCake && colour ? colour : undefined,
    });
    reset();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: GUTTER,
            paddingVertical: space.md,
            borderBottomWidth: HAIRLINE,
            borderBottomColor: c.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="headline">
              {product ? product.name : "Pick something up"}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {product
                ? `${product.vendor.name}${product.vendor.area ? `, ${product.vendor.area}` : ""}`
                : "Collected on your way, not a stop on the plan"}
            </Text>
          </View>
          <Pressable onPress={product ? reset : onClose} hitSlop={12}>
            <Symbol
              name={product ? "chevron.left.circle.fill" : "xmark.circle.fill"}
              size={28}
              color={c.textTertiary}
            />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: GUTTER,
            paddingBottom: insets.bottom + space.xl,
          }}
        >
          {loading ? (
            <View style={{ paddingVertical: space.xxl, alignItems: "center" }}>
              <ActivityIndicator color={c.accent} />
            </View>
          ) : null}

          {!loading && vendors && !allProducts.length ? (
            <Text variant="body" tone="tertiary" center style={{ paddingVertical: space.xl }}>
              Nothing available for this date yet. Cakes usually need a day or
              two of notice.
            </Text>
          ) : null}

          {/* ── choosing a thing ── */}
          {!product && allProducts.length ? (
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}
            >
              {allProducts.map((p) => {
                const from = Math.min(...p.variants.map((v) => v.price_ghs));
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setProductId(p.id);
                      setVariantId(p.variants[0]?.id ?? null);
                    }}
                    style={{ width: "48%", marginBottom: space.lg }}
                  >
                    <View
                      style={{
                        aspectRatio: 1,
                        borderRadius: radius.card,
                        overflow: "hidden",
                        backgroundColor: c.backgroundElement,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {p.image_url ? (
                        <Image
                          source={{ uri: p.image_url }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                        />
                      ) : (
                        <Symbol
                          name={p.vendor.kind === "cake" ? "birthday.cake" : "leaf"}
                          size={30}
                          color={c.textTertiary}
                        />
                      )}
                    </View>
                    <Text variant="footnote" numberOfLines={1} style={{ marginTop: space.xs }}>
                      {p.name}
                    </Text>
                    <Text variant="caption1" tone="secondary">
                      from {ghs(from)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* ── choosing a size, and what goes on it ── */}
          {product ? (
            <>
              <View
                style={{
                  aspectRatio: 16 / 10,
                  borderRadius: radius.card,
                  overflow: "hidden",
                  backgroundColor: c.backgroundElement,
                  marginBottom: space.lg,
                }}
              >
                {product.image_url ? (
                  <Image
                    source={{ uri: product.image_url }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                ) : null}
              </View>

              {product.description ? (
                <Text variant="footnote" tone="secondary" style={{ marginBottom: space.lg }}>
                  {product.description}
                </Text>
              ) : null}

              <Text variant="eyebrow" tone="secondary" uppercase style={{ marginBottom: space.sm }}>
                {isCake ? "Size" : "How many"}
              </Text>
              <View style={{ gap: space.sm, marginBottom: space.lg }}>
                {product.variants.map((v) => {
                  const on = v.id === variantId;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setVariantId(v.id);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: space.md,
                        borderRadius: radius.control,
                        backgroundColor: on ? c.backgroundSelected : c.backgroundElement,
                        borderWidth: on ? 1.5 : HAIRLINE,
                        borderColor: on ? c.accent : c.border,
                      }}
                    >
                      <Text variant="body">{v.label}</Text>
                      <Text variant="body" tone={on ? "tint" : "secondary"} tabular>
                        {ghs(v.price_ghs)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Bouquets get multiplied; you do not buy two of one cake. */}
              {!isCake ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: space.lg,
                  }}
                >
                  <Text variant="body">Bunches</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                    <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} hitSlop={8}>
                      <Symbol name="minus.circle.fill" size={28} color={c.textTertiary} />
                    </Pressable>
                    <Text variant="headline" tabular>
                      {quantity}
                    </Text>
                    <Pressable onPress={() => setQuantity((q) => Math.min(20, q + 1))} hitSlop={8}>
                      <Symbol name="plus.circle.fill" size={28} color={c.accent} />
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {isCake ? (
                <>
                  <Text
                    variant="eyebrow"
                    tone="secondary"
                    uppercase
                    style={{ marginBottom: space.sm }}
                  >
                    Writing on it
                  </Text>
                  <TextInput
                    value={message}
                    onChangeText={(t) => setMessage(t.slice(0, 60))}
                    placeholder="Happy Birthday Kofi"
                    placeholderTextColor={c.textTertiary}
                    maxLength={60}
                    style={{
                      backgroundColor: c.backgroundElement,
                      borderRadius: radius.control,
                      paddingHorizontal: space.md,
                      height: 44,
                      color: c.text,
                      fontSize: typeScale.body.fontSize,
                      marginBottom: space.lg,
                    }}
                  />

                  <Text
                    variant="eyebrow"
                    tone="secondary"
                    uppercase
                    style={{ marginBottom: space.sm }}
                  >
                    Colour
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: space.md,
                      marginBottom: space.lg,
                    }}
                  >
                    {COLOURS.map((col) => {
                      const on = colour === col.label;
                      return (
                        <Pressable
                          key={col.label}
                          onPress={() => setColour(on ? null : col.label)}
                          style={{ alignItems: "center", width: 56 }}
                        >
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: col.hex,
                              borderWidth: on ? 2.5 : HAIRLINE,
                              borderColor: on ? c.accent : c.border,
                            }}
                          />
                          <Text
                            variant="caption1"
                            tone={on ? "tint" : "tertiary"}
                            numberOfLines={1}
                            style={{ marginTop: 4 }}
                          >
                            {col.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <View
                style={{
                  padding: space.md,
                  borderRadius: radius.control,
                  backgroundColor: c.backgroundElement,
                  marginBottom: space.lg,
                }}
              >
                <Text variant="footnote" tone="secondary">
                  Collect from {product.vendor.name}
                  {product.vendor.area ? `, ${product.vendor.area}` : ""} ·{" "}
                  {leadTimeLabel(product.vendor.lead_time_hours)}
                </Text>
              </View>

              <Button
                title={
                  variant
                    ? `Add ${ghs(variant.price_ghs * quantity)} to the plan`
                    : "Pick a size"
                }
                onPress={confirm}
                disabled={!variant}
              />
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
