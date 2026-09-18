import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { GUTTER, Spacing, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { instagramUrl } from "../../lib/format";
import { fetchFeatured, type FeaturedVenue } from "../../lib/data";

/**
 * A few places worth knowing about this week.
 *
 * Kept off the tab bar on purpose. Five tabs is already the most a phone
 * should carry, and a sixth for something you read once a week would crowd
 * the four you use every time. It belongs on the home screen, above the
 * occasions, where somebody who has not decided what to do yet is already
 * looking.
 *
 * Renders nothing at all when nothing is running, rather than an empty shelf
 * with a heading over it. A section that is usually empty teaches people to
 * scroll past the place it sits.
 */
export function FeaturedRow() {
  const c = useTheme();
  const [rows, setRows] = useState<FeaturedVenue[]>([]);

  useEffect(() => {
    let active = true;
    fetchFeatured()
      .then((r) => active && setRows(r))
      // Silent. This is a shelf on a home screen, and a failure to load it is
      // not worth a message in front of somebody trying to plan an evening.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!rows.length) return null;

  return (
    <>
      <Text
        variant="eyebrow"
        tone="secondary"
        uppercase
        style={{ paddingHorizontal: GUTTER, marginTop: Spacing.section, marginBottom: Spacing.two }}
      >
        Featured this week
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.md }}
      >
        {rows.map((row) => (
          <Card key={row.id} row={row} />
        ))}
      </ScrollView>
    </>
  );
}

function Card({ row }: { row: FeaturedVenue }) {
  const c = useTheme();
  const instagram = instagramUrl(row.instagram_handle);

  return (
    <Pressable
      onPress={() => instagram && void Linking.openURL(instagram)}
      disabled={!instagram}
      style={{
        width: 232,
        borderRadius: radius.card,
        overflow: "hidden",
        backgroundColor: c.backgroundElement,
      }}
    >
      {row.image_url ? (
        <Image
          source={{ uri: row.image_url }}
          style={{ width: "100%", height: 116, backgroundColor: c.skeleton }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        /*
         * No picture is the common case: not one venue in the catalogue has
         * one yet. A flat band in the venue's own accent reads as a card that
         * has not been photographed, rather than as one that failed to load.
         */
        <View
          style={{
            height: 116,
            backgroundColor: c.backgroundSelected,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Symbol name="fork.knife" size={22} color={c.textTertiary} />
        </View>
      )}

      <View style={{ padding: space.md, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Text variant="headline" numberOfLines={1} style={{ flex: 1 }}>
            {row.name}
          </Text>
          {/*
            Said plainly, every time, and not something the admin can switch
            off. Somewhere we picked because we like it and somewhere that paid
            to be here are different claims, and a reader who cannot tell them
            apart has been told neither.
          */}
          {row.is_paid ? (
            <Text
              variant="caption2"
              weight="700"
              uppercase
              style={{ color: c.textTertiary, letterSpacing: 0.4 }}
            >
              Promoted
            </Text>
          ) : null}
        </View>

        <Text variant="footnote" tone="secondary" numberOfLines={2}>
          {row.headline?.trim() || row.description?.trim() || row.area || ""}
        </Text>

        {instagram ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
            <Symbol name="arrow.up.right" size={10} color={c.accent} />
            <Text variant="caption1" weight="600" style={{ color: c.accent }}>
              See them on Instagram
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
