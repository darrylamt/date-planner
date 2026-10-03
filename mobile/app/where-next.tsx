import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Symbol } from "../src/components/Symbol";
import { Chip } from "../src/components/Chip";
import { ChipRow, Segmented } from "../src/components/Segmented";
import { NextSpotSheet } from "../src/components/plan/NextSpotSheet";
import { useReducedMotion } from "../src/components/motion";
import { MeshBackground } from "../src/components/native/MeshBackground";
import { GUTTER, radius, space, Spacing } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { chooseAction } from "../src/lib/actionSheet";
import { currentPlace, locationAvailable } from "../src/lib/location";
import { shakeAvailable, useShake } from "../src/lib/shake";
import { fetchAreas } from "../src/lib/data";
import { fetchNextSpots, type NextSpot } from "../src/lib/api";
import type { Area } from "../src/lib/types";

/**
 * Where next, with no plan: pick a mood, shake the phone, get somewhere.
 *
 * For the night that was never planned, or has run past its plan: out
 * already, wanting one more place, deciding on the pavement. So it asks
 * almost nothing. A mood, who is going, and where from, which is where the
 * phone is, read at the moment they shake or tap and not before, or an area
 * if they would rather not say.
 *
 * Moods are the way people say it, not the catalogue's words. Some only set
 * the feel and leave the kind of place to the hour (late and lively is a
 * bar, the afternoon a café); some name the kind themselves, because
 * "something sweet" means dessert at any hour.
 */
type Mood = { id: string; label: string; vibes: string[]; kinds?: string[]; occasion?: string };
const MOODS: Mood[] = [
  { id: "chill", label: "Chill", vibes: ["chill"] },
  { id: "lively", label: "Lively", vibes: ["lively"] },
  { id: "club", label: "Club hopping", vibes: ["club hopping"], kinds: ["lounge"] },
  { id: "romantic", label: "Romantic", vibes: ["romantic"], occasion: "date_night" },
  { id: "hungry", label: "Hungry", vibes: ["foodie"], kinds: ["restaurant", "cafe"] },
  { id: "sweet", label: "Something sweet", vibes: [], kinds: ["dessert", "cafe"] },
  { id: "do", label: "Something to do", vibes: ["fun"], kinds: ["activity"] },
  { id: "outside", label: "Outdoors", vibes: ["outdoorsy"], kinds: ["outdoor", "activity"] },
];

type Who = "1" | "2" | "4";
type From = { kind: "me" } | { kind: "area"; id: string; name: string };
const LAST_CITY = "duro.city.last";

const pad = (n: number) => String(n).padStart(2, "0");

export default function WhereNext() {
  const c = useTheme();
  const reduced = useReducedMotion();
  const [mood, setMood] = useState<Mood>(MOODS[0]);
  const [who, setWho] = useState<Who>("2");
  const [from, setFrom] = useState<From>(locationAvailable() ? { kind: "me" } : { kind: "area", id: "", name: "" });
  const [areas, setAreas] = useState<Area[] | null>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [spots, setSpots] = useState<NextSpot[]>([]);
  const [index, setIndex] = useState(0);
  const [rideFrom, setRideFrom] = useState<{ lat: number; lng: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  // A different question means a different list.
  useEffect(() => {
    setSpots([]);
    setIndex(0);
  }, [mood, who, from]);

  async function areasOfCity(): Promise<Area[]> {
    if (areas) return areas;
    const [all, city] = await Promise.all([fetchAreas().catch(() => [] as Area[]), AsyncStorage.getItem(LAST_CITY).catch(() => null)]);
    const mine = all.filter((a) => (a.city || "Accra") === (city || "Accra"));
    setAreas(mine.length ? mine : all);
    return mine.length ? mine : all;
  }

  async function pickArea(): Promise<From | null> {
    const list = await areasOfCity();
    return new Promise((resolve) =>
      chooseAction({
        title: "Where from?",
        actions: [
          ...(locationAvailable() ? [{ text: "Near me", onPress: () => resolve({ kind: "me" as const }) }] : []),
          ...list.map((a) => ({ text: a.name, onPress: () => resolve({ kind: "area" as const, id: a.id, name: a.name }) })),
        ],
      })
    );
  }

  async function ask() {
    if (loading) return;
    setNote(null);
    // Shaken again with the answer still up: the next one, without asking the server.
    if (open && index + 1 < spots.length) {
      void Haptics.selectionAsync();
      setIndex((i) => i + 1);
      return;
    }

    let where = from;
    let near: { lat: number; lng: number } | undefined;
    if (where.kind === "me") {
      const here = await currentPlace();
      if (here === "denied" || here === "unavailable") {
        setNote(here === "denied" ? "Location is off for Duro, so pick an area instead." : "We could not find you just now. Pick an area instead.");
        const picked = await pickArea();
        if (!picked || picked.kind === "me") return;
        where = picked;
        setFrom(picked);
      } else {
        near = here;
      }
    } else if (!where.id) {
      const picked = await pickArea();
      if (!picked) return;
      setFrom(picked);
      if (picked.kind === "me") return;
      where = picked;
    }

    setOpen(true);
    setLoading(true);
    const now = new Date();
    const city = (await AsyncStorage.getItem(LAST_CITY).catch(() => null)) ?? undefined;
    const res = await fetchNextSpots({
      near,
      areaId: where.kind === "area" ? where.id : undefined,
      kinds: mood.kinds,
      vibes: mood.vibes,
      occasion: mood.occasion ?? (who === "1" ? "solo_day" : "friend_outing"),
      partySize: Number(who),
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      city,
      exclude: spots.map((s) => s.id),
    });
    setLoading(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSpots(res?.spots ?? []);
    setIndex(0);
    setRideFrom(res?.from ?? null);
  }

  useShake(() => void ask(), focused);

  /* The phone on the card, rocking, so the gesture explains itself. */
  const rock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rock, { toValue: 1, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(rock, { toValue: -1, duration: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(rock, { toValue: 0, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(1400),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, rock]);

  const canShake = shakeAvailable();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxxl }}>
        <View style={{ paddingHorizontal: GUTTER, paddingTop: space.md }}>
          <Text variant="display">Where next?</Text>
          <Text variant="body" tone="secondary" style={{ marginTop: Spacing.two }}>
            Pick a mood, then {canShake ? "shake your phone" : "tap below"}. We find somewhere open near you, with prices we know.
          </Text>
        </View>

        <Text variant="footnote" weight="600" tone="secondary" style={{ paddingHorizontal: GUTTER, marginTop: space.xl, marginBottom: space.sm }}>
          THE MOOD
        </Text>
        <ChipRow>
          {MOODS.map((m) => (
            <Chip key={m.id} label={m.label} selected={m.id === mood.id} onPress={() => setMood(m)} />
          ))}
        </ChipRow>

        <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl }}>
          <Segmented
            label="Who's going?"
            options={[
              { value: "1", label: "Just me" },
              { value: "2", label: "Two of us" },
              { value: "4", label: "A group" },
            ]}
            value={who}
            onChange={setWho}
          />
        </View>

        <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl, flexDirection: "row" }}>
          <Pressable
            onPress={async () => {
              const picked = await pickArea();
              if (picked) setFrom(picked);
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radius.pill,
              backgroundColor: c.backgroundElement,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Symbol name={from.kind === "me" ? "location.fill" : "mappin.and.ellipse"} size={14} color={c.accent} />
            <Text variant="callout" weight="600" style={{ color: c.accent }}>
              {from.kind === "me" ? "Near me" : from.name || "Choose an area"}
            </Text>
            <Symbol name="chevron.down" size={11} weight="semibold" color={c.accent} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => void ask()}
          accessibilityRole="button"
          accessibilityLabel={`Find somewhere ${mood.label.toLowerCase()}`}
          style={({ pressed }) => ({
            marginHorizontal: GUTTER,
            marginTop: space.xxl,
            paddingVertical: space.xxl,
            borderRadius: radius.card,
            backgroundColor: c.accentSoft,
            alignItems: "center",
            gap: space.md,
            overflow: "hidden",
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <MeshBackground
            period={5000}
            colors={[c.accentSoft, c.background, c.accentSoft, c.background, `${c.accent}33`, c.accentSoft, c.accentSoft, c.background, `${c.accent}22`]}
          />
          <Animated.View
            style={{ transform: [{ rotate: rock.interpolate({ inputRange: [-1, 1], outputRange: ["-14deg", "14deg"] }) }] }}
          >
            <Symbol name="iphone.radiowaves.left.and.right" size={56} color={c.accent} />
          </Animated.View>
          <Text variant="title2" style={{ color: c.accent }}>
            {canShake ? "Shake your phone" : "Find me somewhere"}
          </Text>
          <Text variant="footnote" tone="secondary" center style={{ paddingHorizontal: GUTTER }}>
            {canShake ? "or tap here" : "Shaking to ask arrives with the next app update."}
          </Text>
        </Pressable>

        {note ? (
          <Text variant="footnote" tone="secondary" center style={{ marginTop: space.md, paddingHorizontal: GUTTER }}>
            {note}
          </Text>
        ) : null}
      </ScrollView>

      <NextSpotSheet
        visible={open}
        onClose={() => setOpen(false)}
        spot={spots[index] ?? null}
        loading={loading}
        from={rideFrom}
        shakeHint={canShake}
        onAnother={() => void ask()}
      />
    </View>
  );
}
