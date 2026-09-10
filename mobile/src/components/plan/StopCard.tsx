import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { MenuSheet } from "./MenuSheet";
import { HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";
import type { ItineraryOrder, ItineraryStop } from "../../lib/types";

/**
 * One stop on the timeline: photo, timing, what you are ordering (editable),
 * why it fits, and the actions that only make sense here.
 */
export function StopCard({
  stop,
  index,
  onSwap,
  onOrdersChange,
  onReserve,
  swapping,
  reserving,
}: {
  stop: ItineraryStop;
  index: number;
  onSwap: () => void;
  onOrdersChange: (orders: ItineraryOrder[]) => void;
  onReserve: () => void;
  swapping: boolean;
  reserving: boolean;
}) {
  const c = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const editable = stop.kind !== "event";
  const canReserve = stop.reservation_required && !stop.reservation_requested;

  /** Quantity stepper. Dropping to zero removes the line entirely. */
  function changeQty(at: number, delta: number) {
    void Haptics.selectionAsync();
    const next: ItineraryOrder[] = [];
    stop.orders.forEach((o, i) => {
      if (i !== at) {
        next.push(o);
        return;
      }
      const unit = o.qty > 0 ? o.price_ghs / o.qty : o.price_ghs;
      const qty = o.qty + delta;
      if (qty >= 1) next.push({ ...o, qty, price_ghs: Math.round(unit * qty) });
    });
    onOrdersChange(next);
  }

  function openMaps() {
    const url =
      stop.google_maps_url ??
      `https://maps.apple.com/?q=${encodeURIComponent(`${stop.name} ${stop.area} Accra`)}`;
    void Linking.openURL(url);
  }

  return (
    <View
      style={{
        backgroundColor: c.backgroundElement,
        borderRadius: radius.card,
        overflow: "hidden",
        opacity: swapping ? 0.5 : 1,
      }}
    >
      {stop.image_url ? (
        <Image
          source={{ uri: stop.image_url }}
          style={{ width: "100%", height: 168, backgroundColor: c.skeleton }}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      <View style={{ padding: space.lg, gap: space.sm }}>
        {/* Label + time */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="caption1" tone="tint" weight="700" style={{ letterSpacing: 0.6 }}>
            {stop.label.toUpperCase()}
          </Text>
          <Text variant="caption1" tone="secondary" tabular>
            {stop.arrival_time} · {stop.duration_mins} min
          </Text>
        </View>

        <Text variant="title3">{stop.name}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Symbol name="mappin" size={12} color={c.textSecondary} />
          <Text variant="footnote" tone="secondary">
            {stop.area}
          </Text>
        </View>

        {stop.what_to_do ? (
          <Text variant="subheadline" tone="secondary" style={{ marginTop: space.xs }}>
            {stop.what_to_do}
          </Text>
        ) : null}

        {/* Order lines with steppers */}
        {stop.orders.length > 0 ? (
          <View
            style={{
              marginTop: space.sm,
              borderTopWidth: HAIRLINE,
              borderTopColor: c.border,
              paddingTop: space.sm,
            }}
          >
            {stop.orders.map((o, i) => (
              <View
                key={`${o.item}-${i}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  paddingVertical: 6,
                }}
              >
                <Text variant="subheadline" style={{ flex: 1 }} numberOfLines={2}>
                  {o.item}
                </Text>

                {editable ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Pressable
                      onPress={() => changeQty(i, -1)}
                      hitSlop={8}
                      accessibilityLabel={`Remove one ${o.item}`}
                    >
                      <Symbol name="minus.circle" size={22} color={c.textSecondary} />
                    </Pressable>
                    <Text variant="subheadline" tabular weight="600" style={{ minWidth: 16, textAlign: "center" }}>
                      {o.qty}
                    </Text>
                    <Pressable
                      onPress={() => changeQty(i, 1)}
                      hitSlop={8}
                      accessibilityLabel={`Add one ${o.item}`}
                    >
                      <Symbol name="plus.circle" size={22} />
                    </Pressable>
                  </View>
                ) : (
                  <Text variant="subheadline" tone="secondary" tabular>
                    x{o.qty}
                  </Text>
                )}

                <Text variant="subheadline" tabular style={{ minWidth: 74, textAlign: "right" }}>
                  {ghs(o.price_ghs)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Stop subtotal */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopWidth: HAIRLINE,
            borderTopColor: c.border,
            paddingTop: space.sm,
          }}
        >
          <Text variant="subheadline" tone="secondary">
            Stop total
          </Text>
          <Text variant="subheadline" weight="600" tabular>
            {ghs(stop.est_cost_ghs)}
          </Text>
        </View>

        {/* Why this fits */}
        {stop.why_this_fits ? (
          <View
            style={{
              backgroundColor: c.accentSoft,
              borderRadius: 10,
              padding: space.md,
              marginTop: space.xs,
            }}
          >
            <Text variant="footnote" style={{ color: c.accent }}>
              {stop.why_this_fits}
            </Text>
          </View>
        ) : null}

        {stop.reservation_requested ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs }}>
            <Symbol name="checkmark.circle.fill" size={14} color={c.success} />
            <Text variant="footnote" tone="green">
              Reservation requested
            </Text>
          </View>
        ) : null}

        {/* Actions */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: space.sm,
            marginTop: space.sm,
            borderTopWidth: HAIRLINE,
            borderTopColor: c.border,
            paddingTop: space.md,
          }}
        >
          <StopAction icon="arrow.triangle.2.circlepath" label="Swap" onPress={onSwap} busy={swapping} />
          {editable ? (
            <StopAction icon="list.bullet" label="Menu" onPress={() => setMenuOpen(true)} />
          ) : null}
          <StopAction icon="map" label="Map" onPress={openMaps} />
          {canReserve ? (
            <StopAction icon="phone.fill" label="Reserve" onPress={onReserve} busy={reserving} />
          ) : null}
        </View>
      </View>

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        venueId={stop.venue_id}
        venueName={stop.name}
        orders={stop.orders}
        onOrdersChange={onOrdersChange}
      />
    </View>
  );
}

function StopAction({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: Parameters<typeof Symbol>[0]["name"];
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: space.md,
        height: 32,
        borderRadius: radius.pill,
        backgroundColor: c.backgroundSelected,
        opacity: pressed ? 0.6 : busy ? 0.5 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={c.accent} /> : <Symbol name={icon} size={13} weight="semibold" />}
      <Text variant="footnote" weight="600" style={{ color: c.accent }}>
        {label}
      </Text>
    </Pressable>
  );
}
