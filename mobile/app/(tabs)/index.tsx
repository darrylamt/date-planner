import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { Chip } from "../../src/components/Chip";
import { GUTTER, HAIRLINE, Radius, Spacing, TAB_BAR } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { loadDraft, type Draft } from "../../src/lib/draft";
import { longDate } from "../../src/lib/format";
import { TOTAL_STEPS } from "../../src/lib/planConstants";
import { FeaturedRow } from "../../src/components/home/FeaturedRow";
import { CityChip } from "../../src/components/home/CityChip";
import { SectionHeading } from "../../src/components/home/SectionHeading";
import { Avatar } from "../../src/components/home/Avatar";
import { OccasionRow } from "../../src/components/home/OccasionRow";
import { OccasionGrid } from "../../src/components/home/OccasionGrid";
import { NativeSheet } from "../../src/components/native/NativeSheet";
import { fetchAllowance } from "../../src/lib/chat";
import { startNewPlan } from "../../src/lib/startPlan";
import { setBillSource } from "../../src/lib/bill";
import { useSeason } from "../../src/lib/season";
import { HalloweenCard, SpookyDrift } from "../../src/components/home/Halloween";
import { countSavedPlans, fetchProfile } from "../../src/lib/account";
import { supabase } from "../../src/lib/supabase";
import { myGroups } from "../../src/lib/groupApi";
import type { GroupSummary } from "../../src/lib/groups";
import type { PlanInputs } from "../../src/lib/types";
import { HeardFromCard } from "../../src/components/HeardFromCard";

/*
 * Group outings, before launch: shown to admin accounts only, so they can be
 * tried on a real phone. Set true to show everybody.
 */
const GROUPS_LAUNCHED = false;

/*
 * The occasion row's order: most planned first, from plan_demand over the 60
 * days to 18 Oct 2026 (date night 48, birthday 32, first date 27, solo 25,
 * friends 18, graduation 16). Most people only see the first two and a half
 * without swiping. Here rather than in the mirrored constants so it can be
 * reordered over the air.
 */
const ROW_ORDER: PlanInputs["occasion"][] = [
  "date_night",
  "birthday",
  "first_date",
  "solo_day",
  "friend_outing",
  "graduation",
  "anniversary",
  "business_meeting",
  "family_day",
  "celebration",
];

/** Set once the first plan is saved; "How it works" is only for people who have not planned yet. */
const FIRST_SAVE_KEY = "duro.firstSave.v1";

/**
 * Home: what are you planning?
 *
 * A new user should know what to do from the first screen, so the occasions
 * come first, as one row of big cards, and everything else follows in order
 * of how often it is needed: a plan already under way, "out already", the
 * week's featured places, how it works for first-timers, and the bill tools
 * for a night that was never planned here. Durobot has its own tab now, so
 * it no longer takes the top of this screen.
 */
export default function Home() {
  const c = useTheme();
  const { season } = useSeason();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [me, setMe] = useState<{ avatarUrl: string | null; initial: string } | null>(null);
  const [pro, setPro] = useState(false);
  const [groupsOn, setGroupsOn] = useState(GROUPS_LAUNCHED);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [newcomer, setNewcomer] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadDraft().then((d) => active && setDraft(d));
      // On focus, so a new photo set in Settings is here when they come back.
      void fetchProfile()
        .then((p) =>
          active &&
          setMe(
            // No email is an account-less session: nobody to show yet.
            p?.email
              ? { avatarUrl: p.avatarUrl, initial: (p.displayName ?? "").slice(0, 1).toUpperCase() }
              : null
          )
        )
        .catch(() => undefined);
      // "How it works" until the first plan is saved, on this phone or on the account.
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
      // Group outings: everyone once launched, admins until then; their groups either way.
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
      // On focus too, so the star is there when they come back from buying Pro.
      void fetchAllowance()
        .then((a) => active && setPro(a?.tier === "pro"))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [])
  );

  const draftInputs = draft?.inputs as PlanInputs | undefined;
  // Once saved it is no longer in progress: it is in Plans.
  const hasDraft = Boolean(draftInputs && !draft?.shareSlug && (draft?.itinerary || draft?.step));
  const draftDone = draft?.itinerary ? TOTAL_STEPS : Math.min(draft?.step ?? 0, TOTAL_STEPS);
  const draftPct = Math.round((draftDone / TOTAL_STEPS) * 100);
  /** First stop's photo stands in for the plan, the way a cover image would. */
  const draftImage = draft?.itinerary?.stops?.[0]?.image_url ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: TAB_BAR.clearance }}
      showsVerticalScrollIndicator={false}
    >
      {season === "halloween" ? <SpookyDrift /> : null}

      {/* Where, and you. One slim row: the city a plan starts in, and Settings. */}
      <View
        style={{
          paddingHorizontal: GUTTER,
          paddingTop: Spacing.four,
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <CityChip style={{ marginBottom: 0 }} />
        <Avatar
          size={40}
          avatarUrl={me?.avatarUrl ?? null}
          initial={me?.initial || null}
          pro={pro}
          onPress={() => router.push("/profile")}
        />
      </View>

      {/* What are you planning? See all sits on the line right above the cards it opens. */}
      <View style={{ paddingHorizontal: GUTTER, marginTop: Spacing.three, gap: Spacing.one }}>
        <Text variant="title1">What are you planning?</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.three }}>
          <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {season === "halloween" ? "Pick one, or make it Halloween." : "Pick one. We plan the whole outing."}
          </Text>
          <Pressable hitSlop={10} onPress={() => setAllOpen(true)} accessibilityRole="button">
            <Text variant="subheadline" weight="600" style={{ color: c.accent }}>
              See all
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={{ marginTop: Spacing.three }}>
        <OccasionRow
          order={ROW_ORDER}
          onPick={(id) => void startNewPlan(id, "home_row")}
          lead={
            season === "halloween"
              ? (width) => (
                  <HalloweenCard
                    width={width}
                    onPlan={(date) => void startNewPlan(undefined, "home_season", date ? { date, start: "19:00" } : undefined)}
                  />
                )
              : undefined
          }
        />
      </View>

      <View style={{ paddingHorizontal: GUTTER, marginTop: Spacing.three, gap: Spacing.two }}>
        {/* A plan already under way: one slim bar, straight back into it. */}
        {hasDraft && draftInputs ? (
          <Pressable
            onPress={() => router.push("/plan/new")}
            accessibilityRole="button"
            accessibilityLabel="Resume your plan in progress"
            style={({ pressed }) => ({
              height: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.three,
              paddingHorizontal: Spacing.three,
              borderRadius: Radius.lg,
              backgroundColor: c.backgroundElement,
              borderWidth: HAIRLINE,
              borderColor: c.border,
              overflow: "hidden",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {draftImage ? (
              <Image source={{ uri: draftImage }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.skeleton }} contentFit="cover" />
            ) : (
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.backgroundSunken, alignItems: "center", justifyContent: "center" }}>
                <Symbol name="calendar" size={16} color={c.textTertiary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text variant="subheadline" weight="600" numberOfLines={1}>
                {draft?.itinerary ? draft.itinerary.title : `Plan for ${longDate(draftInputs.date)}`}
              </Text>
              <Text variant="footnote" tone="secondary">
                {draft?.itinerary ? "Ready to view" : `${draftPct}% done`}
              </Text>
            </View>
            <Symbol name="play.fill" size={14} color={c.accent} />
            <View style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${draftPct}%`, backgroundColor: c.accent }} />
          </Pressable>
        ) : null}

        {/* Out already, and with friends when that is switched on. */}
        <View style={{ flexDirection: "row", gap: Spacing.two }}>
          <QuickTile
            icon="iphone.radiowaves.left.and.right"
            title="Out already?"
            sub={groupsOn ? "Shake for a spot" : "Shake for somewhere near you"}
            tint
            onPress={() => router.push("/where-next")}
          />
          {groupsOn ? (
            <QuickTile icon="person.3.fill" title="Plan with friends" sub="Every budget fits" onPress={() => router.push("/group/new")} />
          ) : null}
        </View>
        {groups.map((g) => (
          <Pressable
            key={g.code}
            onPress={() => router.push(`/group/${g.code}`)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.two,
              paddingVertical: Spacing.two,
              paddingHorizontal: Spacing.three,
              borderRadius: Radius.lg,
              backgroundColor: c.accentSoft,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Symbol name="person.3.fill" size={14} color={c.accent} />
            <Text variant="subheadline" weight="600" style={{ flex: 1 }} numberOfLines={1}>
              {g.title || "Group outing"}
            </Text>
            <Text variant="footnote" tone="secondary">
              {g.status === "locked" ? "Planned" : g.role === "organiser" ? "Collecting answers" : "Answered"}
            </Text>
          </Pressable>
        ))}
      </View>

      <FeaturedRow />

      {/* Asked once, and not on a first visit. */}
      {newcomer ? null : <HeardFromCard />}

      {/* Only for somebody who has not planned yet. */}
      {newcomer ? (
        <>
          <SectionHeading title="How it works" />
          <View style={{ paddingHorizontal: GUTTER, gap: Spacing.three }}>
            <Step n="01" title="Pick the occasion" body="A date, a birthday, a day on your own, a night out with friends." />
            <Step n="02" title="Area, budget and day" body="Where, how much, and when. Everything else is optional." />
            <Step n="03" title="Get the whole outing, priced" body="Back-to-back stops from real menus, inside your budget." />
          </View>
        </>
      ) : null}

      {/* For a night that was never planned here. Inside a plan they are already one tap away. */}
      <View
        style={{
          paddingHorizontal: GUTTER,
          marginTop: Spacing.section,
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: Spacing.two,
        }}
      >
        <Text variant="footnote" tone="secondary" style={{ marginRight: Spacing.one }}>
          Out with no plan?
        </Text>
        <Chip
          label="🎲 Who pays?"
          onPress={() => {
            setBillSource(null);
            router.push("/who-pays");
          }}
        />
        <Chip
          label="💸 Split a bill"
          onPress={() => {
            setBillSource(null);
            router.push("/split");
          }}
        />
      </View>

      <Text variant="footnote" tone="tertiary" style={{ paddingHorizontal: GUTTER, marginTop: Spacing.section }}>
        Menu prices come from our catalogue and can change. Transport is always an estimate.
      </Text>

      {/* Every occasion, with what each is for. Closes before the planner opens. */}
      <NativeSheet visible={allOpen} onClose={() => setAllOpen(false)} detents={["medium", "large"]}>
        <ScrollView contentContainerStyle={{ padding: GUTTER, gap: Spacing.three }}>
          <Text variant="title2">What are you planning?</Text>
          <OccasionGrid
            onPick={(id) => {
              setAllOpen(false);
              setTimeout(() => void startNewPlan(id, "home_all"), 350);
            }}
          />
        </ScrollView>
      </NativeSheet>
    </ScrollView>
  );
}

function QuickTile({
  icon,
  title,
  sub,
  tint = false,
  onPress,
}: {
  icon: "iphone.radiowaves.left.and.right" | "person.3.fill";
  title: string;
  sub: string;
  tint?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderRadius: Radius.lg,
        backgroundColor: tint ? c.accentSoft : c.backgroundElement,
        borderWidth: tint ? 0 : HAIRLINE,
        borderColor: c.border,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Symbol name={icon} size={18} color={c.accent} />
      <View style={{ flex: 1 }}>
        <Text variant="subheadline" weight="600" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption1" tone="secondary" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Symbol name="chevron.right" size={12} weight="semibold" color={c.textTertiary} />
    </Pressable>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <View style={{ flexDirection: "row", gap: Spacing.three }}>
      <Text variant="caption" tone="tertiary" tabular style={{ width: 22, marginTop: 2 }}>
        {n}
      </Text>
      <View style={{ flex: 1 }}>
        <Text variant="headline">{title}</Text>
        <Text variant="footnote" tone="secondary" style={{ marginTop: 1 }}>
          {body}
        </Text>
      </View>
    </View>
  );
}
