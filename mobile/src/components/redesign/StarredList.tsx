import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Symbol } from "../Symbol";
import { GUTTER } from "../../theme";
import { useLook } from "../../lib/appearance";
import { chooseAction } from "../../lib/actionSheet";
import {
  FREE_STARS,
  deleteList,
  myLists,
  setStar,
  setStarAlerts,
  starAlertsOn,
  starredVenues,
  type StarList,
  type StarredVenue,
} from "../../lib/stars";
import { Body, Display } from "../look";
import { ListSheet } from "./ListSheet";

/**
 * The Plans tab's Starred view (0103): the places this account starred,
 * newest first, each opening its page; the star unstars it. Free accounts
 * are told the limit once they reach it.
 *
 * Pro (0113): named lists to sort them into, shown as chips that filter the
 * view, and alerts when a starred place adds an event or dishes or changes a
 * price. A free account sees both, and tapping either offers Pro.
 */
export function StarredList({ pro, onPro }: { pro: boolean; onPro: () => void }) {
  const look = useLook();
  const [items, setItems] = useState<StarredVenue[] | null>(null);
  const [lists, setLists] = useState<StarList[]>([]);
  const [alerts, setAlerts] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ venue?: StarredVenue; rename?: StarList } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      void starredVenues().then((v) => on && setItems(v));
      void myLists().then((l) => on && setLists(l));
      void starAlertsOn().then((a) => on && setAlerts(a));
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

  const current = filter ? lists.find((l) => l.id === filter) ?? null : null;
  const shown = current ? items.filter((v) => current.venueIds.includes(v.id)) : items;

  async function toggleAlerts() {
    if (!pro) return onPro();
    const next = !alerts;
    void Haptics.selectionAsync();
    setAlerts(next);
    const r = await setStarAlerts(next);
    if (!r.ok) {
      setAlerts(!next);
      if (r.message) Alert.alert("Alerts", r.message);
    }
  }

  function listMenu(l: StarList) {
    chooseAction({
      title: l.name,
      dark: look.scheme === "dark",
      actions: [
        { text: "Rename", onPress: () => setSheet({ rename: l }) },
        {
          text: "Delete list",
          destructive: true,
          onPress: () => {
            // The places stay starred; only the list goes.
            setLists((cur) => cur.filter((x) => x.id !== l.id));
            if (filter === l.id) setFilter(null);
            void deleteList(l.id);
          },
        },
      ],
    });
  }

  const chip = (label: string, active: boolean, onPress: () => void, onLongPress?: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 18,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: active ? look.primary : look.tileEdge,
        backgroundColor: active ? look.primary : look.tile,
      }}
    >
      <Body size={14} weight="600" color={active ? look.onPrimary : undefined}>
        {label}
      </Body>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      {/* Alerts: Pro, off until turned on. */}
      <View style={{ paddingHorizontal: GUTTER }}>
        <Pressable
          onPress={() => void toggleAlerts()}
          accessibilityRole="switch"
          accessibilityState={{ checked: Boolean(alerts) }}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: look.tileEdge, backgroundColor: look.tile }}
        >
          <Symbol name={alerts ? "bell.fill" : "bell"} size={22} color={look.primary} />
          <View style={{ flex: 1 }}>
            <Body size={15} weight="700">
              {pro ? "Tell me what's new" : "Tell me what's new · Pro"}
            </Body>
            <Body size={13} tone="secondary">
              A note when these places add an event or dishes, or change a price. At most once a day.
            </Body>
          </View>
          <Symbol name={!pro ? "lock.fill" : alerts ? "checkmark.circle.fill" : "circle"} size={24} color={alerts ? look.primary : look.colors.textTertiary} />
        </Pressable>
      </View>

      {/* Lists: Pro. All, then each list (hold one to rename or delete it), then a new one. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 8 }}>
        {chip(`All ${items.length}`, filter === null, () => setFilter(null), undefined, "all")}
        {lists.map((l) => chip(`${l.name} ${l.venueIds.filter((id) => items.some((v) => v.id === id)).length}`, filter === l.id, () => setFilter(l.id), () => listMenu(l), l.id))}
        {chip(pro ? "+ New list" : "+ Lists · Pro", false, () => (pro ? setSheet({}) : onPro()), undefined, "new")}
      </ScrollView>

      <View style={{ paddingHorizontal: GUTTER, gap: 10 }}>
        <Body size={13} tone="secondary">
          {current
            ? `${shown.length} in ${current.name}. Hold the list's name to rename or delete it.`
            : pro
              ? `${items.length} starred`
              : `${items.length} of ${FREE_STARS} stars${items.length >= FREE_STARS ? ". Pro keeps any number." : ""}`}
        </Body>
        {current && !shown.length ? (
          <Body size={15} tone="secondary">
            Nothing in this list yet. Tap the folder on a place under All to add it.
          </Body>
        ) : null}
        {shown.map((v) => (
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
              accessibilityLabel={`Lists for ${v.name}`}
              hitSlop={8}
              onPress={() => (pro ? setSheet({ venue: v }) : onPro())}
              style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
            >
              <Symbol name={lists.some((l) => l.venueIds.includes(v.id)) ? "folder.fill" : "folder.badge.plus"} size={20} color={look.primary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Unstar ${v.name}`}
              hitSlop={8}
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

      <ListSheet
        visible={sheet !== null}
        venue={sheet?.venue ?? null}
        rename={sheet?.rename ?? null}
        lists={lists}
        onClose={() => setSheet(null)}
        onChanged={setLists}
        onPro={() => {
          // iOS shows no sheet over one still closing.
          setSheet(null);
          setTimeout(onPro, 450);
        }}
      />
    </View>
  );
}
