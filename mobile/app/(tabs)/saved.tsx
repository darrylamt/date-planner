import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Group, Row } from "../../src/components/List";
import { Symbol } from "../../src/components/Symbol";
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
        icon="person.crop.circle"
        title="Sign in to see your plans"
        body="Saved plans live on your account, so you can open them on any device."
        action={<Button title="Sign in" onPress={() => router.push("/login")} />}
      />
    );
  }

  if (plans.length === 0) {
    return (
      <Empty
        icon="bookmark"
        title="No saved plans yet"
        body="Build a plan and save it — it will show up here with its share link."
        action={<Button title="Plan a date" icon="sparkles" onPress={() => router.push("/plan/new")} />}
      />
    );
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
          <Row
            icon="square.and.arrow.up"
            title="Share link"
            onPress={() =>
              void Share.share({
                message: `Our plan for ${longDate(plan.inputs.date)} — ${WEB_URL}/p/${plan.share_slug}`,
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
  icon,
  title,
  body,
  action,
}: {
  icon: Parameters<typeof Symbol>[0]["name"];
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
      <Symbol name={icon} size={44} color={c.textSecondary} />
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
