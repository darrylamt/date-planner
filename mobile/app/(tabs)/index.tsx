import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER, TAB_BAR } from "../../src/theme";
import { useLook } from "../../src/lib/appearance";
import { loadDraft, type Draft } from "../../src/lib/draft";
import { longDate } from "../../src/lib/format";
import { TOTAL_STEPS } from "../../src/lib/planConstants";
import { FeaturedRow } from "../../src/components/home/FeaturedRow";
import { Avatar } from "../../src/components/home/Avatar";
import { fetchAllowance } from "../../src/lib/chat";
import { startNewPlan } from "../../src/lib/startPlan";
import { setBillSource } from "../../src/lib/bill";
import { countSavedPlans, fetchProfile } from "../../src/lib/account";
import { supabase } from "../../src/lib/supabase";
import { myGroups } from "../../src/lib/groupApi";
import type { GroupSummary } from "../../src/lib/groups";
import type { PlanInputs } from "../../src/lib/types";
import { HeardFromCard } from "../../src/components/HeardFromCard";
import { askForNudgesOnce } from "../../src/lib/nudges";
import { Body, Display, KenteBand, LookScreen } from "../../src/components/look";
import { DurobotOrb } from "../../src/components/redesign/DurobotOrb";
import { TripsHome } from "../../src/components/redesign/TripsHome";

/*
 * Group outings, before launch: shown to admin accounts only, so they can be
 * tried on a real phone. Set true to show everybody.
 */
const GROUPS_LAUNCHED = false;

/** Set once the first plan is saved; "How it works" is only for people who have not planned yet. */
const FIRST_SAVE_KEY = "duro.firstSave.v1";

/** "Akwaaba." in Kente; otherwise the time of day. */
function greeting(lookId: string): string {
  if (lookId === "kente") return "Akwaaba.";
  const h = new Date().getHours();
  return h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening.";
}

/**
 * Home, redesigned (owner, 2 Nov 2026).
 *
 * One question and one button: where to tonight, and Plan a night, which asks
 * the occasion first. Durobot sits under it as a bar to talk to, then the
 * things for a night already under way, what is on, and the bill tools. The
 * same layout in every look; only the look changes.
 */
export default function Home() {
  const look = useLook();
  const c = look.colors;
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"outings" | "trips">("outings");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [me, setMe] = useState<{ avatarUrl: string | null; initial: string } | null>(null);
  const [pro, setPro] = useState(false);
  const [groupsOn, setGroupsOn] = useState(GROUPS_LAUNCHED);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [newcomer, setNewcomer] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Weekend ideas, asked once on this phone, after Home has settled (nudges.ts).
      const ask = setTimeout(() => active && void askForNudgesOnce(), 2500);
      void loadDraft().then((d) => active && setDraft(d));
      void fetchProfile()
        .then((p) =>
          active &&
          setMe(p?.email ? { avatarUrl: p.avatarUrl, initial: (p.displayName ?? "").slice(0, 1).toUpperCase() } : null)
        )
        .catch(() => undefined);
      void (async () => {
        const seen = await AsyncStorage.getItem(FIRST_SAVE_KEY).catch(() => null);
        if (seen) return active && setNewcomer(false);
        const saved = await countSavedPlans().catch(() => 0);
        if (saved > 0) {
          await AsyncStorage.setItem(FIRST_SAVE_KEY, "1").catch(() => undefined);
          return active && setNewcomer(false);
        }
        if (active) setNewcomer(true);
      })();
      void (async () => {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        let on = GROUPS_LAUNCHED;
        if (!on) {
          const { data: row } = await supabase.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
          on = Boolean((row as { is_admin?: boolean } | null)?.is_admin);
        }
        if (!active) return;
        setGroupsOn(on);
        if (on) {
          const r = await myGroups();
          if (active && r.ok) setGroups(r.data.groups.filter((g) => g.status !== "cancelled").slice(0, 3));
        }
      })().catch(() => undefined);
      void fetchAllowance()
        .then((a) => active && setPro(a?.tier === "pro"))
        .catch(() => undefined);
      return () => {
        active = false;
        clearTimeout(ask);
      };
    }, [])
  );

  const draftInputs = draft?.inputs as PlanInputs | undefined;
  // Once saved it is no longer in progress: it is in Plans.
  const hasDraft = Boolean(draftInputs && !draft?.shareSlug && (draft?.itinerary || draft?.step));
  const draftDone = draft?.itinerary ? TOTAL_STEPS : Math.min(draft?.step ?? 0, TOTAL_STEPS);
  const draftPct = Math.round((draftDone / TOTAL_STEPS) * 100);
  const draftImage = draft?.itinerary?.stops?.[0]?.image_url ?? null;

  return (
    <LookScreen band="none">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: TAB_BAR.clearance }}
        showsVerticalScrollIndicator={false}
      >
        {/* The band scrolls with the page, under the status bar, so the clock never sits on it. */}
        <View style={{ height: insets.top, backgroundColor: look.band ? look.colors.background : "transparent" }} />
        <KenteBand />

        <View style={{ paddingHorizontal: GUTTER, paddingTop: 20, gap: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Body size={15} weight="600" tone="secondary">
              {greeting(look.id)}
            </Body>
            <Avatar size={40} avatarUrl={me?.avatarUrl ?? null} initial={me?.initial || null} pro={pro} onPress={() => router.push("/profile")} />
          </View>

          <Display size={48} weight="700" style={{ marginTop: 6 }}>
            {mode === "outings" ? "Where to tonight?" : "Where are you headed?"}
          </Display>

          <Segmented value={mode} onChange={setMode} />

          {mode === "trips" ? (
            // Trips: the researched places and the server's trip engine (TripsHome, /api/trip/generate).
            <TripsHome />
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Plan a night. We plan it all, with real prices."
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  void startNewPlan(undefined, "home_cta");
                }}
                style={({ pressed }) => ({
                  height: 136,
                  borderRadius: 28,
                  backgroundColor: look.sky ? look.tile : look.primary,
                  borderWidth: look.sky ? 1 : 0,
                  borderColor: look.tileEdge,
                  padding: 20,
                  justifyContent: "space-between",
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Display size={28} weight="700" color={look.sky ? c.text : look.onPrimary}>
                    Plan a night
                  </Display>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: look.sky ? look.primary : look.id === "daylight" ? c.accent : look.colors.background,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Symbol
                      name="arrow.right"
                      size={18}
                      weight="bold"
                      color={look.sky ? look.onPrimary : look.id === "daylight" ? "#FFFFFF" : look.primary}
                    />
                  </View>
                </View>
                <Body size={15} weight="500" color={look.sky ? c.textSecondary : look.onPrimary} style={{ opacity: look.sky ? 1 : 0.85 }}>
                  We plan it all, with real prices.
                </Body>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ask Durobot anything"
                onPress={() => router.navigate("/durobot")}
                style={({ pressed }) => ({
                  height: 56,
                  borderRadius: look.id === "daylight" ? 18 : 28,
                  borderWidth: 1,
                  borderColor: look.tileEdge,
                  backgroundColor: look.sky ? look.tile : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingLeft: 12,
                  paddingRight: 8,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <DurobotOrb size={34} />
                <Body size={15} weight="500" tone="secondary" style={{ flex: 1 }}>
                  Ask Durobot anything
                </Body>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: look.tile, alignItems: "center", justifyContent: "center" }}>
                  <Symbol name="mic.fill" size={16} color={c.text} />
                </View>
              </Pressable>

              {hasDraft && draftInputs ? (
                <Pressable
                  onPress={() => router.push("/plan/new")}
                  accessibilityRole="button"
                  accessibilityLabel="Resume your plan in progress"
                  style={({ pressed }) => ({
                    minHeight: 64,
                    borderRadius: 22,
                    backgroundColor: look.tile,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 14,
                    overflow: "hidden",
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  {draftImage ? (
                    <Image source={{ uri: draftImage }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: look.tile, alignItems: "center", justifyContent: "center" }}>
                      <Symbol name="calendar" size={16} color={c.textSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Body size={15} weight="600" numberOfLines={1}>
                      {draft?.itinerary ? draft.itinerary.title : `Plan for ${longDate(draftInputs.date)}`}
                    </Body>
                    <Body size={13} tone="secondary">
                      {draft?.itinerary ? "Ready to view" : `${draftPct}% done`}
                    </Body>
                  </View>
                  <Symbol name="play.fill" size={14} color={c.accent} />
                  <View style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${draftPct}%`, backgroundColor: look.primary }} />
                </Pressable>
              ) : null}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Tile icon="iphone.radiowaves.left.and.right" title="Where next?" sub="Out already? Shake" filled onPress={() => router.push("/where-next")} />
                {groupsOn ? (
                  <Tile icon="person.3.fill" title="With friends" sub="Every budget fits" onPress={() => router.push("/group/new")} />
                ) : (
                  <Tile
                    icon="dice.fill"
                    title="Who pays?"
                    sub="Or split the bill"
                    onPress={() => {
                      setBillSource(null);
                      router.push("/who-pays");
                    }}
                  />
                )}
              </View>

              {groups.map((g) => (
                <Pressable
                  key={g.code}
                  onPress={() => router.push(`/group/${g.code}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 18,
                    backgroundColor: look.tile,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Symbol name="person.3.fill" size={14} color={c.accent} />
                  <Body size={15} weight="600" style={{ flex: 1 }} numberOfLines={1}>
                    {g.title || "Group outing"}
                  </Body>
                  <Body size={13} tone="secondary">
                    {g.status === "locked" ? "Planned" : g.role === "organiser" ? "Collecting answers" : "Answered"}
                  </Body>
                </Pressable>
              ))}
            </>
          )}
        </View>

        {mode === "outings" ? (
          <>
            <FeaturedRow />

            {newcomer ? null : <HeardFromCard />}

            {newcomer ? (
              <View style={{ paddingHorizontal: GUTTER, marginTop: 32, gap: 16 }}>
                <Display size={22} weight="700">
                  How it works
                </Display>
                <HowStep n="1" title="Say what it's for" body="A date, a birthday, a day on your own, friends out." />
                <HowStep n="2" title="Where, how much, and when" body="Five quick answers. Everything else is optional." />
                <HowStep n="3" title="Get the whole outing, priced" body="Back-to-back stops from real menus, inside your budget." />
              </View>
            ) : null}

            <View style={{ paddingHorizontal: GUTTER, marginTop: 28, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {groupsOn ? (
                <SmallLink
                  label="Who pays?"
                  onPress={() => {
                    setBillSource(null);
                    router.push("/who-pays");
                  }}
                />
              ) : null}
              <SmallLink
                label="Split a bill"
                onPress={() => {
                  setBillSource(null);
                  router.push("/split");
                }}
              />
            </View>

            <Body size={12} tone="tertiary" style={{ paddingHorizontal: GUTTER, marginTop: 28 }}>
              Menu prices come from our catalogue and can change. Transport is always an estimate.
            </Body>
          </>
        ) : null}
      </ScrollView>
    </LookScreen>
  );
}

function Segmented({ value, onChange }: { value: "outings" | "trips"; onChange: (v: "outings" | "trips") => void }) {
  const look = useLook();
  const option = (id: "outings" | "trips", label: string) => {
    const on = value === id;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(id);
        }}
        style={{
          height: 34,
          paddingHorizontal: 18,
          borderRadius: 17,
          justifyContent: "center",
          backgroundColor: on ? look.third : "transparent",
        }}
      >
        <Body size={14} weight={on ? "700" : "600"} color={on ? look.onThird : look.colors.text}>
          {label}
        </Body>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: "row", alignSelf: "flex-start", padding: 3, borderRadius: 20, borderWidth: 1, borderColor: look.tileEdge }}>
      {option("outings", "Outings")}
      {option("trips", "Trips")}
    </View>
  );
}

function Tile({
  icon,
  title,
  sub,
  filled = false,
  onPress,
}: {
  icon: "iphone.radiowaves.left.and.right" | "person.3.fill" | "dice.fill";
  title: string;
  sub: string;
  filled?: boolean;
  onPress: () => void;
}) {
  const look = useLook();
  const fg = filled ? look.onSecond : look.colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => ({
        flex: 1,
        height: 112,
        borderRadius: 24,
        padding: 16,
        justifyContent: "space-between",
        backgroundColor: filled ? look.second : "transparent",
        borderWidth: filled ? 0 : 1,
        borderColor: look.tileEdge,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Symbol name={icon} size={22} color={fg} />
      <View>
        <Display size={18} weight="700" color={fg}>
          {title}
        </Display>
        <Body size={13} weight="500" color={fg} style={{ opacity: 0.8 }} numberOfLines={1}>
          {sub}
        </Body>
      </View>
    </Pressable>
  );
}

function HowStep({ n, title, body }: { n: string; title: string; body: string }) {
  const look = useLook();
  return (
    <View style={{ flexDirection: "row", gap: 14 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: look.primary, alignItems: "center", justifyContent: "center" }}>
        <Body size={14} weight="700" color={look.onPrimary}>
          {n}
        </Body>
      </View>
      <View style={{ flex: 1 }}>
        <Body size={16} weight="700">
          {title}
        </Body>
        <Body size={14} tone="secondary">
          {body}
        </Body>
      </View>
    </View>
  );
}

function SmallLink({ label, onPress }: { label: string; onPress: () => void }) {
  const look = useLook();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 38,
        paddingHorizontal: 14,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: look.tileEdge,
        justifyContent: "center",
        alignSelf: "flex-start",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Body size={14} weight="600">
        {label}
      </Body>
    </Pressable>
  );
}
