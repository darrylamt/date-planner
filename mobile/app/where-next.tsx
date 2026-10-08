import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Symbol } from "../src/components/Symbol";
import { Chip } from "../src/components/Chip";
import { ChipRow, Segmented } from "../src/components/Segmented";
import { NextSpotSheet } from "../src/components/plan/NextSpotSheet";
import { Wheel, type WheelHandle } from "../src/components/fun/Wheel";
import { Button } from "../src/components/Button";
import { useReducedMotion } from "../src/components/motion";
import { MeshBackground } from "../src/components/native/MeshBackground";
import { GUTTER, radius, space, Spacing } from "../src/theme";
import { useIsDark, useTheme } from "../src/lib/useTheme";
import { swiftMods, swiftUI } from "../src/lib/swiftUI";
import { chooseAction } from "../src/lib/actionSheet";
import { currentPlace, locationAvailable } from "../src/lib/location";
import { shakeAvailable, useShake } from "../src/lib/shake";
import { fetchAreas } from "../src/lib/data";
import { fetchNextSpots, type NextSpot } from "../src/lib/api";
import { ghs } from "../src/lib/format";
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
const GLASS = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

const pad = (n: number) => String(n).padStart(2, "0");

export default function WhereNext() {
  const c = useTheme();
  const isDark = useIsDark();
  const ui = swiftUI;
  const sm = swiftMods;
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  /*
   * Shake for one answer, or spin: every option laid out first, the ones
   * nobody fancies taken off, then the wheel decides between the rest.
   */
  const [mode, setMode] = useState<"shake" | "spin">("shake");
  const [options, setOptions] = useState<NextSpot[]>([]);
  const [vetoed, setVetoed] = useState<string[]>([]);
  const [optionsFrom, setOptionsFrom] = useState<{ lat: number; lng: number } | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const wheel = useRef<WheelHandle>(null);
  const [mood, setMood] = useState<Mood>(MOODS[0]);
  const [who, setWho] = useState<Who>("2");
  const [from, setFrom] = useState<From>(locationAvailable() ? { kind: "me" } : { kind: "area", id: "", name: "" });
  const [areas, setAreas] = useState<Area[] | null>(null);

  // The city's areas, ready for the menu below.
  useEffect(() => {
    void areasOfCity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start from what home says: near me, or an area of the chosen city.
  useEffect(() => {
    AsyncStorage.getItem("duro.where.from")
      .then((pref) => {
        if (pref === "city") setFrom({ kind: "area", id: "", name: "" });
        else if (pref === "near" && locationAvailable()) setFrom({ kind: "me" });
      })
      .catch(() => undefined);
  }, []);

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
    setOptions([]);
    setVetoed([]);
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

  /** Where to look from: the phone, or an area, asking for one when needed. */
  async function locate(): Promise<{ where: From; near?: { lat: number; lng: number } } | null> {
    let where = from;
    let near: { lat: number; lng: number } | undefined;
    if (where.kind === "me") {
      const here = await currentPlace();
      if (here === "denied" || here === "unavailable") {
        setNote(here === "denied" ? "Location is off for Duro, so pick an area instead." : "We could not find you just now. Pick an area instead.");
        const picked = await pickArea();
        if (!picked || picked.kind === "me") return null;
        where = picked;
        setFrom(picked);
      } else {
        near = here;
      }
    } else if (!where.id) {
      const picked = await pickArea();
      if (!picked) return null;
      setFrom(picked);
      if (picked.kind === "me") return null;
      where = picked;
    }
    return { where, near };
  }

  async function lookUp(where: From, near: { lat: number; lng: number } | undefined, count: number, exclude: string[]) {
    const now = new Date();
    const city = (await AsyncStorage.getItem(LAST_CITY).catch(() => null)) ?? undefined;
    return fetchNextSpots({
      near,
      areaId: where.kind === "area" ? where.id : undefined,
      kinds: mood.kinds,
      vibes: mood.vibes,
      occasion: mood.occasion ?? (who === "1" ? "solo_day" : "friend_outing"),
      partySize: Number(who),
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      city,
      exclude,
      count,
    });
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
    const at = await locate();
    if (!at) return;

    setOpen(true);
    setLoading(true);
    const res = await lookUp(at.where, at.near, 6, spots.map((s) => s.id));
    setLoading(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSpots(res?.spots ?? []);
    setIndex(0);
    setRideFrom(res?.from ?? null);
  }

  /** The options for the wheel: up to eight, the ones already seen left out. */
  async function loadOptions(fresh: boolean) {
    if (optionsLoading) return;
    setNote(null);
    const at = await locate();
    if (!at) return;
    setOptionsLoading(true);
    const res = await lookUp(at.where, at.near, 8, fresh ? options.map((o) => o.id) : []);
    setOptionsLoading(false);
    const list = res?.spots ?? [];
    if (!list.length) setNote("Nothing open and priced near there right now. Try another mood or area.");
    setOptions(list);
    setVetoed([]);
    setOptionsFrom(res?.from ?? null);
  }

  const onWheel = options.filter((o) => !vetoed.includes(o.id));

  async function spin() {
    if (spinning || onWheel.length < 2) return;
    setSpinning(true);
    const at = await wheel.current?.spin();
    setSpinning(false);
    if (at == null || at < 0) return;
    // The place it landed on, in the same sheet a shake opens.
    setSpots([onWheel[at]]);
    setIndex(0);
    setRideFrom(optionsFrom);
    setTimeout(() => setOpen(true), reduced ? 0 : 450);
  }

  useShake(() => void (mode === "spin" ? (onWheel.length >= 2 ? spin() : loadOptions(false)) : ask()), focused);

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

        <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl }}>
          <Segmented
            options={[
              { value: "shake", label: "Shake for one" },
              { value: "spin", label: "Spin the wheel" },
            ]}
            value={mode}
            onChange={setMode}
          />
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

        {/*
          Where from, dressed like the questionnaire's city menu (CityMenu):
          the phone's own menu in a capsule, glass on iOS 26, and the same pill
          opening an action sheet where that is not available.
        */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl, flexDirection: "row" }}>
          {ui && sm && areas ? (
            <ui.Host matchContents colorScheme={isDark ? "dark" : "light"} seedColor={c.accent}>
              <ui.Menu
                label={
                  <ui.HStack spacing={6}>
                    <ui.Image systemName={from.kind === "me" ? "location.fill" : "mappin.and.ellipse"} size={14} />
                    <ui.Text modifiers={[sm.font({ size: 16, weight: "semibold" })]}>
                      {from.kind === "me" ? "Near me" : from.name || "Choose an area"}
                    </ui.Text>
                    <ui.Image systemName="chevron.down" size={11} />
                  </ui.HStack>
                }
                modifiers={[
                  sm.buttonStyle(GLASS ? "glass" : "bordered"),
                  sm.buttonBorderShape("capsule"),
                  sm.tint(c.accent),
                ]}
              >
                {locationAvailable() ? (
                  <ui.Button
                    label="Near me"
                    systemImage={from.kind === "me" ? "checkmark" : "location"}
                    onPress={() => setFrom({ kind: "me" })}
                  />
                ) : null}
                {areas.map((a) => (
                  <ui.Button
                    key={a.id}
                    label={a.name}
                    systemImage={from.kind === "area" && from.id === a.id ? "checkmark" : undefined}
                    onPress={() => setFrom({ kind: "area", id: a.id, name: a.name })}
                  />
                ))}
              </ui.Menu>
            </ui.Host>
          ) : (
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
          )}
        </View>

        {mode === "spin" ? (
          <SpinPanel
            options={options}
            vetoed={vetoed}
            onVeto={(id) => setVetoed((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
            loading={optionsLoading}
            spinning={spinning}
            onLoad={(fresh) => void loadOptions(fresh)}
            onSpin={() => void spin()}
            wheel={wheel}
            size={Math.min(width - GUTTER * 2, 330)}
            canShake={canShake}
          />
        ) : null}

        {mode === "shake" ? (
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
        ) : null}

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
        shakeHint={canShake && mode === "shake"}
        onAnother={() => {
          if (mode === "spin") {
            setOpen(false);
            setTimeout(() => void spin(), 350);
          } else void ask();
        }}
      />
    </View>
  );
}

/**
 * The wheel's half of the screen: the options, each one takeable off, then
 * the wheel with what is left. Every option is shown before the spin, so the
 * wheel is choosing between places they have already seen and agreed to.
 */
function SpinPanel({
  options,
  vetoed,
  onVeto,
  loading,
  spinning,
  onLoad,
  onSpin,
  wheel,
  size,
  canShake,
}: {
  options: NextSpot[];
  vetoed: string[];
  onVeto: (id: string) => void;
  loading: boolean;
  spinning: boolean;
  onLoad: (fresh: boolean) => void;
  onSpin: () => void;
  wheel: React.RefObject<WheelHandle | null>;
  size: number;
  canShake: boolean;
}) {
  const c = useTheme();
  const left = options.filter((o) => !vetoed.includes(o.id));

  if (!options.length) {
    return (
      <View style={{ paddingHorizontal: GUTTER, marginTop: space.xxl, gap: space.md, alignItems: "center" }}>
        <Text variant="body" tone="secondary" center>
          We line up to eight places nearby that suit the mood. Take off any you do not fancy, then spin.
        </Text>
        <Button title={loading ? "Finding places..." : "Show me the options"} icon="dice.fill" loading={loading} onPress={() => onLoad(false)} block />
      </View>
    );
  }

  return (
    <View style={{ marginTop: space.xl }}>
      <Text variant="footnote" weight="600" tone="secondary" style={{ paddingHorizontal: GUTTER, marginBottom: space.sm }}>
        ON THE WHEEL · TAP ONE TO TAKE IT OFF
      </Text>
      <View style={{ paddingHorizontal: GUTTER, gap: space.sm }}>
        {options.map((o) => {
          const off = vetoed.includes(o.id);
          return (
            <Pressable
              key={o.id}
              onPress={() => onVeto(o.id)}
              disabled={spinning || (!off && left.length <= 2)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !off }}
              accessibilityLabel={`${o.name}, ${off ? "off the wheel" : "on the wheel"}`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                padding: space.sm,
                borderRadius: radius.row,
                backgroundColor: c.backgroundElement,
                opacity: off ? 0.45 : pressed ? 0.8 : 1,
              })}
            >
              <Image
                source={o.image_url ? { uri: o.image_url } : undefined}
                style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: c.backgroundSelected }}
                contentFit="cover"
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheadline" weight="600" numberOfLines={1} style={off ? { textDecorationLine: "line-through" } : undefined}>
                  {o.name}
                </Text>
                <Text variant="caption1" tone="secondary" numberOfLines={1}>
                  {o.area} · {o.mins} min away{o.visit ? ` · ${o.visit.what} ~${ghs(o.visit.ghs)}` : ""}
                </Text>
              </View>
              <Symbol name={off ? "plus.circle" : "xmark.circle.fill"} size={22} color={off ? c.accent : c.textTertiary} />
            </Pressable>
          );
        })}
      </View>

      {left.length >= 2 ? (
        <View style={{ alignItems: "center", marginTop: space.xl }}>
          <Wheel ref={wheel} labels={left.map((o) => o.name)} size={size} onCentrePress={onSpin} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: GUTTER, marginTop: space.lg, gap: space.sm }}>
        <Button title={spinning ? "Spinning..." : canShake ? "Spin (or shake)" : "Spin the wheel"} icon="arrow.clockwise" disabled={spinning || left.length < 2} onPress={onSpin} />
        <Button title="Different options" kind="plain" disabled={spinning || loading} loading={loading} onPress={() => onLoad(true)} />
      </View>
    </View>
  );
}
