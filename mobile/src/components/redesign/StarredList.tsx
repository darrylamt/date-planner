import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Symbol } from "../Symbol";
import { GUTTER } from "../../theme";
import { useLook } from "../../lib/appearance";
import { FREE_STARS, setStar, starredVenues, type StarredVenue } from "../../lib/stars";
import { Body, Display } from "../look";

/**
 * The Plans tab's Starred view (0103): the places this account starred,
 * newest first, each opening its page; the star unstars it. Free accounts
 * are told the limit once they reach it.
 */
export function StarredList({ pro }: { pro: boolean }) {
  const look = useLook();
  const [items, setItems] = useState<StarredVenue[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      void starredVenues().then((v) => on && setItems(v));
      return () => {
        on = false;
      };
    }, [])
  );

  if (items === null) return null;
  if (!items.length) {
    return (
      <View style={{ paddingHorizontal: GUTTER, gap: 8 }}>
        <Display size={22} weight="700">
          Nothing starred yet
        </Display>
        <Body size={15} tone="secondary">
          Tap the star on any place to keep it here. Plans lean towards the places you star.
        </Body>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 10 }}>
      <Body size={13} tone="secondary">
        {pro ? `${items.length} starred` : `${items.length} of ${FREE_STARS} stars${items.length >= FREE_STARS ? ". Pro keeps any number." : ""}`}
      </Body>
      {items.map((v) => (
        <Pressable
          key={v.id}
          accessibilityRole="button"
          onPress={() => router.push(`/venue/${v.id}`)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 10,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: look.tileEdge,
            backgroundColor: look.tile,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ width: 56, height: 56, borderRadius: 14, overflow: "hidden", backgroundColor: look.colors.background }}>
            {v.image_url ? <Image source={v.image_url} style={{ flex: 1 }} contentFit="cover" /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Body size={16} weight="700" numberOfLines={1}>
              {v.name}
            </Body>
            {v.area ? (
              <Body size={13} tone="secondary">
                {v.area}
              </Body>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Unstar ${v.name}`}
            hitSlop={10}
            onPress={() => {
              void Haptics.selectionAsync();
              setItems((cur) => (cur ?? []).filter((x) => x.id !== v.id));
              void setStar(v.id, false);
            }}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Symbol name="star.fill" size={20} color={look.primary} />
          </Pressable>
        </Pressable>
      ))}
    </View>
  );
}
