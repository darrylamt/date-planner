import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Share, View } from "react-native";
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
import { Mascot, SpeechBubble } from "../../src/components/Mascot";
import { GUTTER, Spacing, TAB_BAR, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth } from "../../src/lib/useAuth";
import { deletePlan, listPlans } from "../../src/lib/data";
import { ghs, longDate } from "../../src/lib/format";
import type { SavedPlan } from "../../src/lib/types";
import { SkeletonSaved } from "../../src/components/Skeleton";
import { Segmented } from "../../src/components/Segmented";
import { PlansCalendar } from "../../src/components/plans/PlansCalendar";

/** The last view chosen on Plans: the list, or the calendar. */
const VIEW_KEY = "duro.plans.view";
type PlansView = "list" | "calendar";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");



export default function Plans() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /*
   * Plans holds what used to be two tabs: Saved as a list, and Calendar. A
   * ?view= link (old calendar links redirect here) wins over the last view
   * chosen, which is remembered on the phone.
   */
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<PlansView>("list");
  useEffect(() => {
    if (params.view === "calendar" || params.view === "list") {
      setView(params.view);
      void AsyncStorage.setItem(VIEW_KEY, params.view).catch(() => undefined);
      return;
    }
    void AsyncStorage.getItem(VIEW_KEY)
      .then((v) => (v === "calendar" || v === "list") && setView(v))
      .catch(() => undefined);
  }, [params.view]);
  const chooseView = (v: PlansView) => {
    setView(v);
    void AsyncStorage.setItem(VIEW_KEY, v).catch(() => undefined);
  };

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

  if (plans.length === 0) {
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
        paddingTop: insets.top + space.lg,
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
      <Text variant="display" style={{ paddingHorizontal: GUTTER, marginBottom: space.md }}>
        Plans
      </Text>
      <View style={{ paddingHorizontal: GUTTER, marginBottom: space.xl }}>
        <Segmented
          options={[
            { value: "list", label: "List" },
            { value: "calendar", label: "Calendar" },
          ]}
          value={view}
          onChange={chooseView}
        />
      </View>

      {view === "calendar" ? <PlansCalendar plans={plans} /> : null}
      {view === "calendar" ? null : plans.map((plan) => (
        <Group key={plan.id} header={longDate(plan.inputs.date)}>
          {/*
            The plan itself, and the reason this row exists.
            
            It has never been tappable: you could repeat an evening, share it
            or delete it, and never look at it, so the only way back to a plan
            you had already built was to build it again.
          */}
          <Row
            title={plan.itinerary.title}
            subtitle={plan.itinerary.summary_route}
            value={ghs(Number(plan.estimated_total_ghs))}
            chevron
            onPress={() => router.push(`/plan/${plan.share_slug}`)}
          />
          {/*
            Same places, another day.
            *
            * A plan that worked is the best starting point for the next one,
            * and retyping seven answers to get back to it is the reason people
            * do not bother. This reopens the questionnaire with every answer
            * already filled in and only the date cleared, so it is a plan to
            * adjust rather than a plan to rebuild: the venues are re-picked
            * against that day's opening hours rather than copied, because a
            * Saturday plan repeated on a Monday can land on a locked door.
          */}
          <Row
            icon="arrow.clockwise"
            title="Plan this again"
            subtitle="Same answers, new date"
            onPress={() => void repeat(plan)}
          />
          <Row
            icon="square.and.arrow.up"
            title="Share link"
            onPress={() =>
              void Share.share({
                message: `Our plan for ${longDate(plan.inputs.date)}, ${WEB_URL}/p/${plan.share_slug}`,
                url: `${WEB_URL}/p/${plan.share_slug}`,
              })
            }
          />
          <Row
            icon="trash"
            iconColor={c.danger}
            title="Delete"
            destructive
            onPress={() => confirmDelete(plan)}
          />
        </Group>
      ))}
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
      <Mascot occasion="date_night" size={110} style={{ marginTop: Spacing.two }} />
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
