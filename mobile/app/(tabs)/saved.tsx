import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Group, Row } from "../../src/components/List";
import { draftFromPlan } from "../../src/lib/repeatPlan";
import { startNewPlan } from "../../src/lib/startPlan";
import { chooseAction } from "../../src/lib/actionSheet";
import { Symbol } from "../../src/components/Symbol";
import { SpeechBubble } from "../../src/components/SpeechBubble";
import { OccasionMark } from "../../src/components/OccasionMark";
import { GUTTER, Spacing, TAB_BAR, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth } from "../../src/lib/useAuth";
import { deletePlan, fetchMyPlanAnswers, listPlans, type PlanResponse } from "../../src/lib/data";
import { ghs, longDate } from "../../src/lib/format";
import type { SavedPlan } from "../../src/lib/types";
import { SkeletonSaved } from "../../src/components/Skeleton";
import { Segmented } from "../../src/components/Segmented";
import { PlansCalendar } from "../../src/components/plans/PlansCalendar";
import { useLook } from "../../src/lib/appearance";
import { Body, Display, KenteBand } from "../../src/components/look";
import { StarredList } from "../../src/components/redesign/StarredList";
import { fetchAllowance } from "../../src/lib/chat";
import { SITE_URL } from "../../src/lib/site";

/** The last view chosen on Plans: the list, or the calendar. */
const VIEW_KEY = "duro.plans.view";
type PlansView = "list" | "calendar" | "starred";

// Links people see go to the site's own name (site.ts).
const WEB_URL = SITE_URL;



export default function Plans() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pro, setPro] = useState(false);
  useEffect(() => {
    if (session) void fetchAllowance().then((a) => setPro(a?.tier === "pro")).catch(() => undefined);
  }, [session]);
  /*
   * Plans holds what used to be two tabs: Saved as a list, and Calendar. A
   * ?view= link (old calendar links redirect here) wins over the last view
   * chosen, which is remembered on the phone.
   */
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<PlansView>("list");
  useEffect(() => {
    if (params.view === "calendar" || params.view === "list" || params.view === "starred") {
      setView(params.view);
      void AsyncStorage.setItem(VIEW_KEY, params.view).catch(() => undefined);
      return;
    }
    void AsyncStorage.getItem(VIEW_KEY)
      .then((v) => (v === "calendar" || v === "list" || v === "starred") && setView(v))
      .catch(() => undefined);
  }, [params.view]);
  const chooseView = (v: PlansView) => {
    setView(v);
    void AsyncStorage.setItem(VIEW_KEY, v).catch(() => undefined);
  };

  const [answers, setAnswers] = useState<Map<string, PlanResponse[]>>(new Map());
  const load = useCallback(async () => {
    if (!session) {
      setPlans([]);
      return;
    }
    try {
      setPlans(await listPlans());
    } catch {
      setPlans([]);
    }
    // Who said they're in, beside each plan (0107).
    void fetchMyPlanAnswers().then(setAnswers);
  }, [session]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  /* Re-read on focus so a plan saved in the flow shows up on the way back. */
  useFocusEffect(
    useCallback(() => {
      if (!authLoading && session) void load();
    }, [authLoading, session, load])
  );

  function confirmDelete(plan: SavedPlan) {
    chooseAction({
      title: "Delete this plan?",
      message: "This cannot be undone.",
      actions: [
        {
          text: "Delete plan",
          destructive: true,
          onPress: async () => {
            setPlans((cur) => (cur ?? []).filter((p) => p.id !== plan.id));
            try {
              await deletePlan(plan.id);
            } catch {
              void load(); // put it back if the delete failed
            }
          },
        },
      ],
    });
  }

  if (authLoading || plans === null) {
    return (
      <SkeletonSaved />
    );
  }

  if (!session) {
    return (
      <Empty
        bubble="Nothing saved here yet."
        title="Sign in to see your plans"
        body="Saved plans live on your account, by list or by the day they happen, on any device."
        action={<Button title="Sign in" onPress={() => router.push("/login")} />}
      />
    );
  }

  // The Starred view stands on its own: somebody can star places before they ever save a plan.
  if (plans.length === 0 && view !== "starred") {
    return (
      <Empty
        bubble="This shelf is looking empty."
        title="No saved plans yet"
        body="Build a plan and save it, it will show up here with its share link."
        action={<Button title="Plan an outing" icon="sparkles" onPress={() => void startNewPlan(undefined, "plans_empty")} />}
      />
    );
  }

  /** Same answers, a new date. Shared with the plan viewer's "edit". */
  async function repeat(plan: SavedPlan) {
    await draftFromPlan(plan);
    router.push("/plan/new");
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: TAB_BAR.clearance,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={c.textSecondary}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <KenteBand />
      <Text variant="display" style={{ paddingHorizontal: GUTTER, marginTop: space.lg, marginBottom: space.md }}>
        Plans
      </Text>
      <View style={{ paddingHorizontal: GUTTER, marginBottom: space.xl }}>
        <Segmented
          options={[
            { value: "list", label: "List" },
            { value: "calendar", label: "Calendar" },
            { value: "starred", label: "Starred" },
          ]}
          value={view}
          onChange={chooseView}
        />
      </View>

      {view === "calendar" ? <PlansCalendar plans={plans} /> : null}
      {view === "starred" ? <StarredList pro={pro} /> : null}
      {view !== "list" ? null : (
        <View style={{ paddingHorizontal: GUTTER, gap: 16 }}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              answers={answers.get(plan.share_slug) ?? []}
              onOpen={() => router.push(`/plan/${plan.share_slug}`)}
              onRepeat={() => void repeat(plan)}
              onShare={() =>
                void Share.share({
                  message: `Our plan for ${longDate(plan.inputs.date)}, ${WEB_URL}/p/${plan.share_slug}`,
                  url: `${WEB_URL}/p/${plan.share_slug}`,
                })
              }
              onDelete={() => confirmDelete(plan)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Empty({
  bubble,
  title,
  body,
  action,
}: {
  bubble: string;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  const c = useTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: GUTTER + space.sm,
      }}
    >
      <SpeechBubble text={bubble} />
      <OccasionMark occasion="date_night" size={110} style={{ marginTop: Spacing.two }} />
      <Text variant="title3" center style={{ marginTop: space.lg }}>
        {title}
      </Text>
      <Text variant="body" tone="secondary" center style={{ marginTop: space.sm }}>
        {body}
      </Text>
      <View style={{ alignSelf: "stretch", marginTop: space.xl }}>{action}</View>
    </View>
  );
}

/**
 * A saved plan as a card (redesign, 2 Nov 2026): its first stop's photo
 * fading into the card, the date, the evening's name, the route and the
 * total, and what can be done with it as pills: the plan opens on a tap.
 */
/** "Ama is in", "Ama and Kofi are in, Esi can't make it", or nothing when nobody has answered. */
function answerLine(list: PlanResponse[]): string | null {
  if (!list.length) return null;
  const names = (a: "in" | "cant") => list.filter((r) => r.answer === a).map((r) => r.name ?? "your guest");
  const join = (n: string[]) => (n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const yes = names("in");
  const no = names("cant");
  const parts = [
    yes.length ? `${join(yes)} ${yes.length === 1 ? "is" : "are"} in` : null,
    no.length ? `${join(no)} can't make it` : null,
  ].filter(Boolean) as string[];
  return cap(parts.join(", "));
}

function PlanCard({
  plan,
  answers,
  onOpen,
  onRepeat,
  onShare,
  onDelete,
}: {
  plan: SavedPlan;
  answers: PlanResponse[];
  onOpen: () => void;
  onRepeat: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const look = useLook();
  const c = look.colors;
  const image = plan.itinerary.stops.find((x) => x.image_url)?.image_url ?? null;
  const pill = (label: string, onPress: () => void, danger = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 38,
        paddingHorizontal: 14,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: look.tileEdge,
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Body size={14} weight="600" color={danger ? c.danger : c.text}>
        {label}
      </Body>
    </Pressable>
  );
  return (
    <View style={{ borderRadius: 26, backgroundColor: look.tile, borderWidth: 1, borderColor: look.tileEdge, overflow: "hidden" }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${plan.itinerary.title}, ${longDate(plan.inputs.date)}`} onPress={onOpen}>
        {image ? (
          <View style={{ height: 150 }}>
            <Image source={{ uri: image }} style={{ width: "100%", height: 150 }} contentFit="cover" transition={200} />
            <LinearGradient
              pointerEvents="none"
              colors={["transparent", look.id === "daylight" ? "#F5F5F7" : look.colors.background]}
              style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90 }}
            />
          </View>
        ) : null}
        <View style={{ padding: 16, paddingTop: image ? 0 : 16, gap: 4 }}>
          <Body size={13} weight="700" color={c.accent}>
            {longDate(plan.inputs.date)}
          </Body>
          <Display size={22} weight="700">
            {plan.itinerary.title}
          </Display>
          <Body size={14} tone="secondary" numberOfLines={1}>
            {plan.itinerary.summary_route}
          </Body>
          <Body size={15} weight="700" style={{ marginTop: 4 }}>
            {ghs(Number(plan.estimated_total_ghs))}
          </Body>
          {answerLine(answers) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
              <Symbol name={answers.some((r) => r.answer === "in") ? "checkmark.circle.fill" : "xmark.circle"} size={15} color={answers.some((r) => r.answer === "in") ? c.accent : c.textSecondary} />
              <Body size={14} weight="600" style={{ flex: 1 }} numberOfLines={2}>
                {answerLine(answers)}
              </Body>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
        {pill("Plan this again", onRepeat)}
        {pill("Share", onShare)}
        {pill("Delete", onDelete, true)}
      </View>
    </View>
  );
}
