import { Linking, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { Bone, Skeleton } from "../Skeleton";
import { NativeSheet } from "../native/NativeSheet";
import { GUTTER, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs, uberRideLink, yangoRideLink } from "../../lib/format";
import { RideButton } from "./GettingThereSheet";
import type { NextSpot, SpotPrice } from "../../lib/api";

/** What it costs, as precisely as it is known: an estimate stays a range. */
function priceLine(p: SpotPrice): string | null {
  if (p.basis === "free") return "Free to get in";
  if (p.basis === "menu") return `About ${ghs(p.typical_per_person_ghs)} a head`;
  if (p.basis === "estimated") return `${ghs(p.per_person_range_ghs[0])} to ${ghs(p.per_person_range_ghs[1])} a head, an estimate`;
  return null;
}

/**
 * "Where next?": one place, and another on a shake.
 *
 * The answer is a single place rather than a list, because the question is
 * asked standing on a pavement at eleven at night: a list is a decision, one
 * place is a suggestion. Another shake (or "Another") moves to the next.
 */
export function NextSpotSheet({
  visible,
  onClose,
  spot,
  loading,
  from,
  shakeHint,
  onAnother,
}: {
  visible: boolean;
  onClose: () => void;
  /** Null with loading false: asked, and nothing near is open and priced. */
  spot: NextSpot | null;
  loading: boolean;
  /** Where the night is, for the ride. */
  from: { lat: number; lng: number } | null;
  /** This build can feel a shake, so say that it can. */
  shakeHint: boolean;
  onAnother: () => void;
}) {
  const c = useTheme();
  const price = spot ? priceLine(spot.price) : null;

  return (
    <NativeSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.md, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Symbol name="sparkles" size={14} color={c.accent} />
          <Text variant="eyebrow" style={{ color: c.accent }}>
            WHERE NEXT?
          </Text>
        </View>

        {loading ? (
          <Skeleton style={{ gap: space.sm }}>
            <Bone h={170} r={radius.card} />
            <Bone w="60%" h={22} />
            <Bone w="45%" h={14} />
            <Bone w="80%" h={14} />
          </Skeleton>
        ) : !spot ? (
          <View style={{ gap: space.sm, paddingVertical: space.lg }}>
            <Text variant="title3">Nothing near enough, open and priced</Text>
            <Text variant="body" tone="secondary">
              We only suggest places we know the prices for and that are not shut at this hour. Ask Duro! for
              something further out.
            </Text>
          </View>
        ) : (
          <>
            {spot.image_url ? (
              <Image
                source={{ uri: spot.image_url }}
                style={{ height: 170, borderRadius: radius.card, backgroundColor: c.backgroundSelected }}
                contentFit="cover"
                transition={200}
              />
            ) : null}
            <View style={{ gap: 4 }}>
              <Text variant="title2" numberOfLines={2}>
                {spot.name}
              </Text>
              <Text variant="callout" tone="secondary">
                {[spot.area, `${spot.mins} min away`, `about ${ghs(spot.fare_ghs)} by car`].filter(Boolean).join(" · ")}
              </Text>
              {price ? (
                <Text variant="callout" tone="secondary">
                  {price}
                </Text>
              ) : null}
              <Text variant="footnote" style={{ color: spot.open === "open" ? c.success ?? c.accent : c.textTertiary }}>
                {spot.open === "open" ? `Open then · ${spot.hours}` : "Opening hours not recorded"}
              </Text>
            </View>
            {spot.blurb ? (
              <Text variant="body" tone="secondary" numberOfLines={3}>
                {spot.blurb}
              </Text>
            ) : null}

            <View style={{ gap: space.sm, marginTop: space.xs }}>
              <Button
                title="See the place"
                icon="building.2"
                onPress={() => {
                  onClose();
                  router.push(`/venue/${spot.id}`);
                }}
              />
              {/*
                Both ride apps, side by side, as on Getting there. Uber finds
                the pickup itself; Yango needs a start, which is where the
                search was made from.
              */}
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <RideButton
                  label="Uber"
                  dark
                  onPress={() => void Linking.openURL(uberRideLink({ name: spot.name, area: spot.area, lat: spot.lat, lng: spot.lng }))}
                />
                {from && spot.lat != null && spot.lng != null ? (
                  <RideButton
                    label="Yango"
                    onPress={() => void Linking.openURL(yangoRideLink(from, { lat: spot.lat!, lng: spot.lng! }))}
                  />
                ) : null}
              </View>
            </View>
          </>
        )}

        <Button title={spot ? "Another" : "Try again"} kind="plain" icon="arrow.triangle.2.circlepath" onPress={onAnother} />
        {shakeHint ? (
          <Text variant="caption1" tone="tertiary" center>
            Or shake your phone for another
          </Text>
        ) : null}
      </View>
    </NativeSheet>
  );
}
