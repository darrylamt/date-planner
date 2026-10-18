import { View } from "react-native";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs } from "../../lib/format";
import type { GroupMe } from "../../lib/groups";

/**
 * A person's own order on a group outing, sized to the budget they set.
 *
 * Only ever their own: the server returns nobody else's, and this card says
 * so, because the whole point is that friends can go out together without
 * anyone seeing what anyone else can spend.
 */
export function YourOrder({ order }: { order: NonNullable<GroupMe["order"]> }) {
  const c = useTheme();
  const stops = order.stops.filter((s) => s.orders.length || s.shared_ghs);
  return (
    <View
      style={{
        padding: space.lg,
        borderRadius: radius.card,
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
        gap: space.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Symbol name="lock.fill" size={15} color={c.accent} />
        <Text variant="headline" style={{ flex: 1 }}>
          Your order
        </Text>
        <Text variant="footnote" tone="secondary">
          Only you see this
        </Text>
      </View>

      {stops.map((s) => (
        <View key={s.stopIndex} style={{ gap: 4 }}>
          <Text variant="subheadline" weight="600">
            {s.venue_name}
          </Text>
          {s.orders.map((o, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
              <Text variant="subheadline" style={{ flex: 1 }}>
                {o.qty > 1 ? `${o.qty} × ` : ""}
                {o.item}
              </Text>
              <Text variant="subheadline">{ghs(o.price_ghs)}</Text>
            </View>
          ))}
          {s.charges.map((ch, i) => (
            <View key={`c${i}`} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="footnote" tone="secondary">
                {ch.label}
              </Text>
              <Text variant="footnote" tone="secondary">
                {ghs(ch.ghs)}
              </Text>
            </View>
          ))}
          {s.shared_ghs ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="footnote" tone="secondary">
                Your share of entry or booking
              </Text>
              <Text variant="footnote" tone="secondary">
                {ghs(s.shared_ghs)}
              </Text>
            </View>
          ) : null}
        </View>
      ))}

      <View style={{ borderTopWidth: HAIRLINE, borderTopColor: c.border, paddingTop: space.sm, gap: 4 }}>
        {order.rides_ghs ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="subheadline" tone="secondary">
              Your share of rides
            </Text>
            <Text variant="subheadline" tone="secondary">
              {ghs(order.rides_ghs)}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="headline">Your evening</Text>
          <Text variant="headline">{ghs(order.total_ghs)}</Text>
        </View>
        <Text variant="footnote" tone="secondary">
          Within the {ghs(order.budget_ghs)} you set. Everyone pays for their own order.
        </Text>
      </View>
    </View>
  );
}
