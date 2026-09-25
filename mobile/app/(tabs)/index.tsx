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
import { SectionHeading } from "../../src/components/home/SectionHeading";
import { Glow } from "../../src/components/home/Glow";
import { startNewPlan } from "../../src/lib/startPlan";
import { fetchProfile } from "../../src/lib/account";
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
  const [me, setMe] = useState<{ avatarUrl: string | null; initial: string } | null>(null);

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
      return () => {
        active = false;
      };
    }, [])
  );

  const draftInputs = draft?.inputs as PlanInputs | undefined;
  // Once saved it is no longer in progress: it is in Saved.
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
      <View style={{ paddingHorizontal: GUTTER, paddingTop: Spacing.five }}>
        {/*
          The concierge, as a bar rather than a button in the corner.
          *
          * It was a 64pt circle pinned to the right, which left most of a row
          * empty above the first line of the screen: a band of nothing across
          * two thirds of the width, which read as a layout waiting for
          * something rather than as space.
          *
          * A bar uses the whole width it was already taking and can say what
          * it does. A circle with a glyph in it has to be recognised; a bar
          * with words in it is read.
          *
          * Still not a tab. It answers a question rather than being somewhere
          * you go, and a fifth destination would have turned the bar into a
          * list.
        */}
        {/*
          The bar and "you", side by side.
          *
          * Settings left the tab bar to make room for Venues, and the top
          * right corner is where people already look for themselves: it is
          * where every other app keeps the avatar. Sharing the row also takes
          * the bar down from the full width, which was more than a button
          * needs.
        */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.three }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask adurobot"
          onPress={() => router.push("/chat")}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
        >
          <Glow>
          {/*
            Four colours, one border.
            *
            * expo-linear-gradient is not a dependency and adding one would
            * mean a native build, which cannot ship over the air: every phone
            * already carrying this app would keep its old binary and never
            * see it. A rectangle has four border edges that can each take
            * their own colour, so unlike the circle this needed no second
            * rotated copy to fake it, and the corners blend the pairs for
            * free.
          */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.two,
              height: 54,
              paddingHorizontal: Spacing.three,
              borderRadius: Radius.pill,
              borderWidth: 2,
              borderTopColor: "#7C5CFF",
              borderRightColor: "#FF5CA8",
              borderBottomColor: "#FFB020",
              borderLeftColor: "#33D6C7",
              backgroundColor: c.backgroundElement,
            }}
          >
            {/*
              Sparkles because that is what this means now. Any other glyph
              has to be learned; this one is already read as "ask the model".
            */}
            <Symbol name="sparkles" size={21} color={c.accent} />
            <Text variant="headline" weight="600" style={{ flex: 1 }}>
              Ask adurobot
            </Text>
            <Symbol name="chevron.right" size={14} color={c.textTertiary} />
          </View>
          </Glow>
        </Pressable>

        {/*
          Ringed in the bar's own four colours, so the two read as one pair
          at the top of the screen rather than a bar and a stray grey dot.
          A gap of background between ring and picture, the way a story ring
          works, because a ring drawn straight onto a photo's edge is lost in
          it.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="You and settings"
          onPress={() => router.push("/profile")}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 54,
            height: 54,
            borderRadius: 27,
            borderWidth: 2.5,
            borderTopColor: "#7C5CFF",
            borderRightColor: "#FF5CA8",
            borderBottomColor: "#FFB020",
            borderLeftColor: "#33D6C7",
            padding: 2.5,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 22,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: me?.avatarUrl || me?.initial ? c.accent : c.backgroundElement,
            }}
          >
            {me?.avatarUrl ? (
              <Image source={{ uri: me.avatarUrl }} style={{ width: 44, height: 44 }} contentFit="cover" />
            ) : me?.initial ? (
              <Text variant="headline" style={{ color: "#FFFFFF" }}>
                {me.initial}
              </Text>
            ) : (
              <Symbol name="person.fill" size={20} color={c.textSecondary} />
            )}
          </View>
        </Pressable>
        </View>

        <Text variant="display" style={{ marginTop: Spacing.four }}>
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
