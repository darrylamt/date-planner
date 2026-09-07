import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import {
  Elevation,
  GUTTER,
  HAIRLINE,
  Radius,
  Spacing,
  TAB_BAR,
} from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { loadDraft, type Draft } from "../../src/lib/draft";
import { longDate } from "../../src/lib/format";
import { OCCASIONS, TOTAL_STEPS } from "../../src/lib/planConstants";
import { startNewPlan } from "../../src/lib/startPlan";
import type { PlanInputs } from "../../src/lib/types";
import type { SymbolViewProps } from "expo-symbols";

/** One icon per occasion, so a card is recognisable before it is read. */
const OCCASION_ICON: Record<string, SymbolViewProps["name"]> = {
  first_date: "sparkles",
  anniversary: "heart.fill",
  date_night: "moon.stars.fill",
  friend_outing: "person.2.fill",
};

export default function Home() {
  const c = useTheme();
  const [draft, setDraft] = useState<Draft | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadDraft().then((d) => active && setDraft(d));
      return () => {
        active = false;
      };
    }, [])
  );

  const draftInputs = draft?.inputs as PlanInputs | undefined;
  const hasDraft = Boolean(draftInputs && (draft?.itinerary || draft?.step));
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
      <View style={{ paddingHorizontal: GUTTER, paddingTop: Spacing.three }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.two }}>
          <Symbol name="flame.fill" size={15} color={c.accent} />
          <Text variant="eyebrow" tone="secondary" uppercase>
            aduro · Accra
          </Text>
        </View>

        <Text variant="display" style={{ marginTop: Spacing.four }}>
          Plan a date worth turning up for.
        </Text>
      </View>

      {/* In progress */}
      {hasDraft && draftInputs ? (
        <>
          <SectionHeading title="In progress" />
          <Pressable
            onPress={() => router.push("/plan/new")}
            style={({ pressed }) => [
              {
                marginHorizontal: GUTTER,
                padding: Spacing.three,
                borderRadius: Radius.xl,
                borderWidth: HAIRLINE,
                borderColor: c.border,
                backgroundColor: c.backgroundElement,
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.three,
                opacity: pressed ? 0.7 : 1,
              },
              Elevation.card,
            ]}
          >
            {draftImage ? (
              <Image
                source={{ uri: draftImage }}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: c.skeleton,
                }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: c.backgroundSunken,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Symbol name="calendar" size={22} color={c.textTertiary} />
              </View>
            )}

            <View style={{ flex: 1, gap: Spacing.one }}>
              <Text variant="title3" numberOfLines={1}>
                {draft?.itinerary
                  ? draft.itinerary.title
                  : `Plan for ${longDate(draftInputs.date)}`}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Symbol
                  name={draft?.itinerary ? "checkmark.circle" : "clock"}
                  size={12}
                  color={c.textSecondary}
                />
                <Text variant="footnote" tone="secondary">
                  {draft?.itinerary ? "Ready to view" : `${draftPct}% complete`}
                </Text>
              </View>

              <View
                style={{
                  height: 6,
                  borderRadius: Radius.pill,
                  backgroundColor: c.backgroundSelected,
                  marginTop: Spacing.one,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${draftPct}%`,
                    height: "100%",
                    backgroundColor: c.accent,
                  }}
                />
              </View>
            </View>

            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Symbol name="play.fill" size={15} color={c.accent} />
            </View>
          </Pressable>
        </>
      ) : null}

      {/* Occasions */}
      <SectionHeading title="Occasions" />
      <View
        style={{
          paddingHorizontal: GUTTER,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: Spacing.three,
        }}
      >
        {OCCASIONS.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => void startNewPlan(o.id)}
            style={({ pressed }) => ({
              // Two per row, accounting for the gap between them.
              width: "47.5%",
              flexGrow: 1,
              padding: Spacing.three,
              borderRadius: Radius.xl,
              borderWidth: HAIRLINE,
              borderColor: c.border,
              backgroundColor: pressed ? c.backgroundSelected : c.backgroundElement,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: c.backgroundSunken,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Symbol
                name={OCCASION_ICON[o.id] ?? "sparkles"}
                size={17}
                color={c.accent}
              />
            </View>
            <Text variant="headline" style={{ marginTop: Spacing.three }}>
              {o.title}
            </Text>
            <Text
              variant="footnote"
              tone="secondary"
              numberOfLines={2}
              style={{ marginTop: 1 }}
            >
              {o.sub}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* How it works */}
      <SectionHeading title="How it works" />
      <View style={{ paddingHorizontal: GUTTER, gap: Spacing.four }}>
        <Step
          n="01"
          title="Pick an area and a budget"
          body="Osu, Labone, Cantonments — or let us surprise you."
        />
        <Step
          n="02"
          title="Tell us about them"
          body="Food they love, places they like, anything to avoid."
        />
        <Step
          n="03"
          title="Get a full itinerary"
          body="Back-to-back stops that stay inside your budget."
        />
      </View>

      <Text
        variant="footnote"
        tone="tertiary"
        style={{ paddingHorizontal: GUTTER, marginTop: Spacing.section }}
      >
        Menu prices come from our catalogue and can change. Transport is always an
        estimate.
      </Text>
    </ScrollView>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <Text
      variant="title2"
      style={{
        paddingHorizontal: GUTTER,
        marginTop: Spacing.section,
        marginBottom: Spacing.three,
      }}
    >
      {title}
    </Text>
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
