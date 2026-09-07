import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER, TAB_BAR, radius, shadow, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { loadDraft, type Draft } from "../../src/lib/draft";
import { longDate } from "../../src/lib/format";
import { OCCASIONS, TOTAL_STEPS } from "../../src/lib/planConstants";
import type { PlanInputs } from "../../src/lib/types";

/**
 * Colour-blocked occasion rows. Fixed colours rather than theme tokens: these
 * are solid blocks whose whole job is to be distinct from each other, and each
 * carries the text colour that stays legible on it.
 */
const OCCASION_STYLE: Record<string, { bg: string; fg: string }> = {
  first_date: { bg: "#6C4CF1", fg: "#FFFFFF" },
  anniversary: { bg: "#E23D6D", fg: "#FFFFFF" },
  date_night: { bg: "#141416", fg: "#FFFFFF" },
  friend_outing: { bg: "#C6E36B", fg: "#141416" },
};

export default function Home() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
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

  function start(occasion?: PlanInputs["occasion"]) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(occasion ? `/plan/new?occasion=${occasion}` : "/plan/new");
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.groupedBackground }}
      contentContainerStyle={{
        paddingTop: insets.top + space.md,
        paddingBottom: TAB_BAR.clearance,
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
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: c.tint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Symbol name="flame.fill" size={17} color={c.onTint} />
          </View>
          <View>
            <Text variant="callout" weight="700">
              aduro
            </Text>
            <Text variant="caption2" tone="secondary">
              Accra
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/saved")}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.surface,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
          accessibilityLabel="Saved plans"
        >
          <Symbol name="bookmark.fill" size={16} color={c.label} />
        </Pressable>
      </View>

      {/* Display title */}
      <View style={{ paddingHorizontal: GUTTER, marginTop: space.xxl }}>
        <Text variant="display" uppercase>
          Plan your date
        </Text>
        <Text variant="subheadline" tone="secondary" style={{ marginTop: space.md }}>
          Seven questions. A full evening across Accra — real menus, real prices,
          transport included.
        </Text>
      </View>

      {/* Resume */}
      {hasDraft && draftInputs ? (
        <Pressable
          onPress={() => router.push("/plan/new")}
          style={({ pressed }) => [
            {
              marginHorizontal: GUTTER,
              marginTop: space.xl,
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
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c.tintMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Symbol name="arrow.right" size={16} />
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
                height: 5,
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
      ) : null}

      {/* Occasion blocks */}
      <Text
        variant="footnote"
        tone="secondary"
        uppercase
        weight="600"
        style={{ paddingHorizontal: GUTTER, marginTop: space.xxxl, marginBottom: space.md }}
      >
        What is the occasion?
      </Text>

      <View style={{ paddingHorizontal: GUTTER, gap: space.md }}>
        {OCCASIONS.map((o) => {
          const style = OCCASION_STYLE[o.id] ?? { bg: c.surface, fg: c.label };
          return (
            <Pressable
              key={o.id}
              onPress={() => start(o.id)}
              style={({ pressed }) => ({
                backgroundColor: style.bg,
                borderRadius: 22,
                paddingVertical: space.lg,
                paddingLeft: space.xl,
                paddingRight: space.md,
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text variant="title3" weight="700" style={{ color: style.fg }}>
                  {o.title}
                </Text>
                <Text
                  variant="footnote"
                  style={{ color: style.fg, opacity: 0.75, marginTop: 2 }}
                >
                  {o.sub}
                </Text>
              </View>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: style.fg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Symbol name="arrow.up.right" size={15} color={style.bg} weight="bold" />
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => start()}
        style={({ pressed }) => ({
          marginHorizontal: GUTTER,
          marginTop: space.md,
          paddingVertical: space.lg,
          borderRadius: 22,
          borderWidth: 1.5,
          borderColor: c.separator,
          alignItems: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text variant="callout" weight="700">
          Start without picking one
        </Text>
      </Pressable>

      {/* How it works */}
      <Text
        variant="footnote"
        tone="secondary"
        uppercase
        weight="600"
        style={{ paddingHorizontal: GUTTER, marginTop: space.xxxl, marginBottom: space.md }}
      >
        How it works
      </Text>
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
