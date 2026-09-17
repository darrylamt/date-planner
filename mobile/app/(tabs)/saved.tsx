import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Group, Row } from "../../src/components/List";
import { Symbol } from "../../src/components/Symbol";
import { Mascot, SpeechBubble } from "../../src/components/Mascot";
import { GUTTER, Spacing, TAB_BAR, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth } from "../../src/lib/useAuth";
import { deletePlan, listPlans } from "../../src/lib/data";
import { ghs, longDate } from "../../src/lib/format";
import type { SavedPlan } from "../../src/lib/types";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");



export default function Plans() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    Alert.alert("Delete this plan?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setPlans((cur) => (cur ?? []).filter((p) => p.id !== plan.id));
          try {
            await deletePlan(plan.id);
          } catch {
            void load(); // put it back if the delete failed
          }
        },
      },
    ]);
  }

  if (authLoading || plans === null) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <Empty
        bubble="Nothing saved here yet."
        title="Sign in to see your plans"
        body="Saved plans live on your account, so you can open them on any device."
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
        action={<Button title="Plan an outing" icon="sparkles" onPress={() => router.push("/plan/new")} />}
      />
    );
  }

  /**
   * Start a new plan from an old one.
   *
   * The date is deliberately dropped rather than carried: repeating last
   * month's evening on last month's date is not what anybody means, and an
   * old date silently sitting in the form is the kind of thing somebody only
   * notices after the plan comes back empty because everywhere was shut.
   */
  async function repeat(plan: SavedPlan) {
    const { saveDraft } = await import("../../src/lib/draft");
    const { stepsFor } = await import("../../src/lib/planConstants");
    const { inputs } = plan;

    /*
     * Tomorrow, not the original date.
     *
     * Carrying the old one over means repeating last month's evening on last
     * month's date, which nobody means, and a stale date sitting in a filled
     * form is only noticed after the plan comes back empty because everywhere
     * was shut. Tomorrow is a real answer they can change in one tap.
     */
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Open on the date question rather than at the start: every other answer
    // is already theirs, and this is the one that has to change.
    const steps = stepsFor(inputs.occasion, false);
    const whenAt = Math.max(0, steps.indexOf("when"));

    await saveDraft({
      inputs: { ...inputs, date: tomorrow.toISOString().slice(0, 10) },
      itinerary: null,
      shareSlug: null,
      step: whenAt,
    });
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
      <Text
        variant="display"
        uppercase
        style={{ paddingHorizontal: GUTTER, marginBottom: space.xl }}
      >
        Saved plans
      </Text>

      {plans.map((plan) => (
        <Group key={plan.id} header={longDate(plan.inputs.date)}>
          <Row
            title={plan.itinerary.title}
            subtitle={plan.itinerary.summary_route}
            value={ghs(Number(plan.estimated_total_ghs))}
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
