import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { Elevation, GUTTER, HAIRLINE, Radius, Spacing } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { loadDraft, type Draft } from "../../src/lib/draft";
import { longDate } from "../../src/lib/format";
import { OCCASIONS, TOTAL_STEPS } from "../../src/lib/planConstants";
import type { PlanInputs } from "../../src/lib/types";

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

  /**
   * Always starts a NEW plan. Resuming is the In progress card's job and
   * nothing else's — when every entry point resumed, a finished plan made it
   * impossible to start another one.
   */
  function start(occasion?: PlanInputs["occasion"]) {
    const go = () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push(
        occasion ? `/plan/new?fresh=1&occasion=${occasion}` : "/plan/new?fresh=1"
      );
    };

    // Replacing real work should never be silent.
    if (hasDraft) {
      Alert.alert(
        "Start a new plan?",
        draft?.itinerary
          ? "Your current plan will be replaced. Save or share it first if you want to keep it."
          : "Your answers so far will be discarded.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Start new", style: "destructive", onPress: go },
        ]
      );
      return;
    }
    go();
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      // Lets the native tab bar and status bar contribute their own insets.
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: Spacing.section }}
      showsVerticalScrollIndicator={false}
    >
      {/* Masthead. No box: the wordmark and the space under it do the work. */}
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
        <Text variant="body" tone="secondary" style={{ marginTop: Spacing.three }}>
          Seven questions. A whole evening across Accra — real menus, real prices,
          transport included.
        </Text>
      </View>

      {/* Resume: the one lifted surface here, because it is the only thing that
          is not part of the page's own hierarchy. */}
      {hasDraft && draftInputs ? (
        <Pressable
          onPress={() => router.push("/plan/new")}
          style={({ pressed }) => [
            {
              marginHorizontal: GUTTER,
              marginTop: Spacing.five,
              padding: Spacing.card,
              borderRadius: Radius.lg,
              borderWidth: HAIRLINE,
              borderColor: c.border,
              backgroundColor: c.backgroundElement,
              opacity: pressed ? 0.7 : 1,
            },
            Elevation.card,
          ]}
        >
          <Text variant="eyebrow" tone="secondary" uppercase>
            In progress
          </Text>
          <Text variant="title3" numberOfLines={1} style={{ marginTop: Spacing.two }}>
            {draft?.itinerary
              ? draft.itinerary.title
              : `Plan for ${longDate(draftInputs.date)}`}
          </Text>
          <Text variant="footnote" tone="secondary" style={{ marginTop: Spacing.half }}>
            {draft?.itinerary ? "Ready to view" : `${draftPct}% complete`}
          </Text>

          {!draft?.itinerary ? (
            <View
              style={{
                height: 3,
                borderRadius: Radius.pill,
                backgroundColor: c.backgroundSelected,
                marginTop: Spacing.three,
                overflow: "hidden",
              }}
            >
              <View
                style={{ width: `${draftPct}%`, height: "100%", backgroundColor: c.accent }}
              />
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {/* Occasions — rows separated by hairlines, not fills. */}
      <Text
        variant="eyebrow"
        tone="secondary"
        uppercase
        style={{ paddingHorizontal: GUTTER, marginTop: Spacing.section }}
      >
        Start with the occasion
      </Text>

      <View style={{ marginTop: Spacing.three }}>
        {OCCASIONS.map((o, i) => (
          <Pressable
            key={o.id}
            onPress={() => start(o.id)}
            style={({ pressed }) => ({
              paddingHorizontal: GUTTER,
              paddingVertical: Spacing.three,
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.three,
              borderTopWidth: i === 0 ? HAIRLINE : 0,
              borderBottomWidth: HAIRLINE,
              borderColor: c.border,
              backgroundColor: pressed ? c.backgroundSelected : "transparent",
            })}
          >
            <Text variant="caption" tone="tertiary" tabular style={{ width: 22 }}>
              {String(i + 1).padStart(2, "0")}
            </Text>
            <View style={{ flex: 1 }}>
              <Text variant="headline">{o.title}</Text>
              <Text variant="footnote" tone="secondary" style={{ marginTop: 1 }}>
                {o.sub}
              </Text>
            </View>
            <Symbol
              name="chevron.right"
              size={13}
              color={c.textTertiary}
              weight="semibold"
            />
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => start()}
        style={({ pressed }) => ({
          marginHorizontal: GUTTER,
          marginTop: Spacing.four,
          height: 52,
          borderRadius: Radius.md,
          backgroundColor: c.brand,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: Spacing.two,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text variant="headline" style={{ color: c.textOnBrand }}>
          Start planning
        </Text>
        <Symbol name="arrow.right" size={14} color={c.textOnBrand} weight="semibold" />
      </Pressable>

      {/* How it works — numbered, unboxed. */}
      <Text
        variant="eyebrow"
        tone="secondary"
        uppercase
        style={{ paddingHorizontal: GUTTER, marginTop: Spacing.section }}
      >
        How it works
      </Text>

      <View
        style={{ paddingHorizontal: GUTTER, marginTop: Spacing.three, gap: Spacing.four }}
      >
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
