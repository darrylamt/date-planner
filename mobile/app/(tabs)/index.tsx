import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER, radius, shadow, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { loadDraft, type Draft } from "../../src/lib/draft";
import { longDate } from "../../src/lib/format";
import { TOTAL_STEPS } from "../../src/lib/planConstants";
import { OCCASIONS } from "../../src/lib/planConstants";
import type { PlanInputs } from "../../src/lib/types";

/** Tab bar is translucent and floats over content, so scrollers pad past it. */
const TAB_BAR_CLEARANCE = 96;

export default function Home() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft | null>(null);

  // Re-read on focus so finishing or abandoning a plan is reflected here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadDraft().then((d) => active && setDraft(d));
      return () => {
        active = false;
      };
    }, [])
  );

  const hasDraft = Boolean(draft?.inputs && (draft.itinerary || draft.step));
  const draftInputs = draft?.inputs as PlanInputs | undefined;
  const draftDone = draft?.itinerary
    ? TOTAL_STEPS
    : Math.min(draft?.step ?? 0, TOTAL_STEPS);
  const draftPct = Math.round((draftDone / TOTAL_STEPS) * 100);

  function start(occasion?: PlanInputs["occasion"]) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(occasion ? `/plan/new?occasion=${occasion}` : "/plan/new");
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.groupedBackground }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Masthead */}
      <View
        style={{
          paddingHorizontal: GUTTER,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Symbol name="flame.fill" size={22} />
          <Text variant="largeTitle">aduro</Text>
        </View>
      </View>
      <Text
        variant="subheadline"
        tone="secondary"
        style={{ paddingHorizontal: GUTTER, marginTop: 2 }}
      >
        A date planned with intention · Accra
      </Text>

      {/* Resume — only when there is something to resume. */}
      {hasDraft && draftInputs ? (
        <>
          <SectionHeader title="In progress" />
          <Pressable
            onPress={() => router.push("/plan/new")}
            style={({ pressed }) => [
              {
                marginHorizontal: GUTTER,
                backgroundColor: c.surface,
                borderRadius: radius.card,
                padding: space.lg,
                opacity: pressed ? 0.7 : 1,
              },
              shadow.card,
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.tintMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Symbol name="arrow.right" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="headline" numberOfLines={1}>
                  {draft?.itinerary
                    ? draft.itinerary.title
                    : `Plan for ${longDate(draftInputs.date)}`}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {draft?.itinerary ? "Ready to view" : `${draftPct}% complete`}
                </Text>
              </View>
            </View>

            {!draft?.itinerary ? (
              <View
                style={{
                  height: 6,
                  borderRadius: radius.pill,
                  backgroundColor: c.fill,
                  marginTop: space.md,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${draftPct}%`,
                    height: "100%",
                    backgroundColor: c.tint,
                    borderRadius: radius.pill,
                  }}
                />
              </View>
            ) : null}
          </Pressable>
        </>
      ) : null}

      {/* Hero */}
      <View style={{ paddingHorizontal: GUTTER, marginTop: space.xxl }}>
        <Pressable
          onPress={() => start()}
          style={({ pressed }) => [
            {
              backgroundColor: c.tint,
              borderRadius: radius.card,
              padding: space.xl,
              opacity: pressed ? 0.85 : 1,
            },
            shadow.card,
          ]}
        >
          <Symbol name="sparkles" size={26} color={c.onTint} />
          <Text variant="title2" style={{ color: c.onTint, marginTop: space.md }}>
            Plan a date
          </Text>
          <Text
            variant="subheadline"
            style={{ color: c.onTint, opacity: 0.85, marginTop: space.xs }}
          >
            Seven questions. A full evening across Accra — real menus, real prices,
            transport included.
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
              marginTop: space.lg,
            }}
          >
            <Text variant="footnote" weight="600" style={{ color: c.onTint }}>
              Start
            </Text>
            <Symbol name="arrow.right" size={13} color={c.onTint} weight="semibold" />
          </View>
        </Pressable>
      </View>

      {/* Jump straight in with the occasion pre-picked. */}
      <SectionHeader title="Or start from an occasion" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.md }}
      >
        {OCCASIONS.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => start(o.id)}
            style={({ pressed }) => ({
              width: 168,
              backgroundColor: c.surface,
              borderRadius: radius.card,
              padding: space.lg,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="headline">{o.title}</Text>
            <Text
              variant="footnote"
              tone="secondary"
              numberOfLines={3}
              style={{ marginTop: space.xs }}
            >
              {o.sub}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <SectionHeader title="How it works" />
      <View
        style={{
          marginHorizontal: GUTTER,
          backgroundColor: c.surface,
          borderRadius: radius.card,
          paddingVertical: space.xs,
        }}
      >
        <Step
          icon="mappin.and.ellipse"
          title="Pick an area and a budget"
          body="Osu, Labone, Cantonments — or let us surprise you"
        />
        <Step
          icon="heart.text.square"
          title="Tell us about them"
          body="Food they love, places they like, anything to avoid"
        />
        <Step
          icon="list.bullet.rectangle"
          title="Get a full itinerary"
          body="Back-to-back stops that stay inside your budget"
          last
        />
      </View>

      <Text
        variant="caption1"
        tone="tertiary"
        center
        style={{ paddingHorizontal: GUTTER, marginTop: space.xl }}
      >
        Prices are estimates and change. Transport is always an estimate.
      </Text>
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      variant="title3"
      style={{ paddingHorizontal: GUTTER, marginTop: space.xxl, marginBottom: space.md }}
    >
      {title}
    </Text>
  );
}

function Step({
  icon,
  title,
  body,
  last,
}: {
  icon: Parameters<typeof Symbol>[0]["name"];
  title: string;
  body: string;
  last?: boolean;
}) {
  const c = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: c.separator,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: c.tintMuted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Symbol name={icon} size={17} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="callout" weight="600">
          {title}
        </Text>
        <Text variant="footnote" tone="secondary">
          {body}
        </Text>
      </View>
    </View>
  );
}
