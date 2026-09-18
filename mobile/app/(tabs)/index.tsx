import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { Mascot } from "../../src/components/Mascot";
import {
  Elevation,
  GUTTER,
  HAIRLINE,
  Radius,
  Spacing,
  TAB_BAR,
} from "../../src/theme";
import { useOccasionHue, useTheme } from "../../src/lib/useTheme";
import { loadDraft, type Draft } from "../../src/lib/draft";
import { longDate } from "../../src/lib/format";
import { OCCASIONS, TOTAL_STEPS } from "../../src/lib/planConstants";
import { FeaturedRow } from "../../src/components/home/FeaturedRow";
import { startNewPlan } from "../../src/lib/startPlan";
import type { PlanInputs } from "../../src/lib/types";
import type { SymbolViewProps } from "expo-symbols";

/** One icon per occasion, so a card is recognisable before it is read. */
const OCCASION_ICON: Record<string, SymbolViewProps["name"]> = {
  first_date: "sparkles",
  anniversary: "heart.fill",
  date_night: "moon.stars.fill",
  birthday: "gift.fill",
  graduation: "graduationcap.fill",
  celebration: "party.popper.fill",
  friend_outing: "person.2.fill",
  solo_day: "figure.walk",
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
      <View style={{ paddingHorizontal: GUTTER, paddingTop: Spacing.five }}>
        {/*
          The concierge, top right.
          *
          * Not a tab: it answers a question rather than being somewhere you
          * go, and a fifth destination would have made the bar a list. Top
          * right is where a phone puts the thing you reach for while already
          * looking at something else.
          *
          * Sparkles because that is what this means now. Any other glyph has
          * to be learned; this one is already read as "ask the model" before
          * the label is.
        */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask adurobot"
            onPress={() => router.push("/chat")}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            {/*
              A four-colour ring, drawn rather than imported.

              expo-linear-gradient is not a dependency and adding one would
              mean a native build, which cannot ship over the air: every phone
              already carrying this app would keep its old binary and never see
              it. Two bordered circles, each colouring two of its four sides
              and the second rotated half a turn, give the same read for
              nothing.
            */}
            <View style={{ width: 64, height: 64, alignItems: "center", justifyContent: "center" }}>
              <View
                style={{
                  position: "absolute",
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  borderWidth: 3,
                  borderColor: "transparent",
                  borderTopColor: "#7C5CFF",
                  borderRightColor: "#FF5CA8",
                }}
              />
              <View
                style={{
                  position: "absolute",
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  borderWidth: 3,
                  borderColor: "transparent",
                  borderTopColor: "#33D6C7",
                  borderRightColor: "#FFB020",
                  transform: [{ rotate: "180deg" }],
                }}
              />
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.backgroundElement,
                }}
              >
                <Symbol name="sparkles" size={26} color={c.accent} />
              </View>
            </View>
          </Pressable>
        </View>

        <Text variant="display" style={{ marginTop: Spacing.two }}>
          {/*
            Not "a date". The catalogue plans birthdays, friends out, solo
            days and graduations, and the word on the first screen decides what
            people think the app is for before they have opened anything.
          */}
          Plan something worth turning up for.
        </Text>
      </View>

      {/* A scene rather than a mascot: two figures at one table read as an
          evening, which is what the app makes. Decorative only, so it is
          hidden from screen readers. */}
      <Image
        source={require("../../assets/mascots/scene_table.png")}
        style={{
          width: "100%",
          height: 128,
          marginTop: Spacing.three,
        }}
        contentFit="contain"
        transition={0}
        accessible={false}
      />

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

      {/*
        Above the occasions, below anything in progress. Somebody with a plan
        already on the go is here to finish it; somebody who has not started is
        the person a recommendation is for.
      */}
      <FeaturedRow />

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
          <OccasionCard key={o.id} occasion={o} />
        ))}
      </View>

      {/* How it works */}
      <SectionHeading title="How it works" />
      <View style={{ paddingHorizontal: GUTTER, gap: Spacing.four }}>
        <Step
          n="01"
          title="Pick an area and a budget"
          body="Osu, Labone, Cantonments, or let us surprise you."
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

/**
 * One occasion. Its own component so the per-occasion hue can be looked up
 * with a hook, which a callback inside a map cannot do.
 */
function OccasionCard({
  occasion,
}: {
  occasion: { id: string; title: string; sub: string };
}) {
  const c = useTheme();
  const hue = useOccasionHue(occasion.id);

  return (
    <Pressable
      onPress={() => void startNewPlan(occasion.id as PlanInputs["occasion"])}
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
      {/* The costume, not a glyph, the card is recognisable at a glance and
          the character appears where people actually choose a pathway. */}
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: hue.bg,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Mascot
          occasion={occasion.id as PlanInputs["occasion"]}
          size={46}
          animate={false}
          style={{ marginTop: 6 }}
        />
      </View>
      <Text variant="headline" style={{ marginTop: Spacing.three }}>
        {occasion.title}
      </Text>
      <Text variant="footnote" tone="secondary" numberOfLines={2} style={{ marginTop: 1 }}>
        {occasion.sub}
      </Text>
    </Pressable>
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
