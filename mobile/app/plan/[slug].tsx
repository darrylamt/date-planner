import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Symbol } from "../../src/components/Symbol";
import { ItineraryView } from "../../src/components/plan/ItineraryView";
import { OccasionThemeProvider, useTheme } from "../../src/lib/useTheme";
import { fetchPlan, updateSavedItinerary } from "../../src/lib/data";
import { draftFromPlan } from "../../src/lib/repeatPlan";
import { GUTTER, space } from "../../src/theme";
import type { Itinerary, SavedPlan } from "../../src/lib/types";

/**
 * A saved plan, opened.
 *
 * The saved list has always been able to repeat a plan, share it or delete it,
 * and never to show it. Tapping a row did nothing, so the only way back to an
 * evening you had already built was to rebuild it.
 *
 * It reuses ItineraryView rather than rendering its own version. That
 * component carries the stop cards, the budget meter, the hop pills, the
 * calendar export, the reservation handoff and the swap logic; a second
 * renderer would be a second place for every one of those to drift, which is
 * the failure this codebase has already had twice with menus and vibe tags.
 */
export default function SavedPlanScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const c = useTheme();

  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const row = await fetchPlan(String(slug));
        if (!active) return;
        if (!row) {
          setFailed(true);
          return;
        }
        setPlan(row);
        setItinerary(row.itinerary);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    navigation.setOptions({ title: plan?.itinerary.title ?? "Your plan" });
  }, [navigation, plan?.itinerary.title]);

  /*
   * Changes stick, rather than living until the screen closes.
   *
   * Written straight through rather than behind a save button: every edit
   * here is one tap on a stepper or a swap, and asking somebody to confirm
   * each one would be asking them to confirm the thing they just did.
   */
  const handleChange = useCallback(
    (next: Itinerary) => {
      setItinerary(next);
      void updateSavedItinerary(String(slug), next);
    },
    [slug]
  );

  if (failed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: GUTTER }}>
        <Symbol name="exclamationmark.triangle.fill" size={40} color={c.warning} />
        <Text variant="title3" center style={{ marginTop: space.lg }}>
          We could not open that plan.
        </Text>
        <Text variant="body" tone="secondary" center style={{ marginTop: space.sm }}>
          It may have been deleted, or it belongs to another account.
        </Text>
        <View style={{ alignSelf: "stretch", marginTop: space.xl }}>
          <Button title="Back to saved plans" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (!plan || !itinerary) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <OccasionThemeProvider occasion={plan.inputs.occasion}>
      <ItineraryView
        inputs={plan.inputs}
        itinerary={itinerary}
        onItineraryChange={handleChange}
        /*
         * "Edit my answers" on a saved plan means building another one from
         * it, not reopening a questionnaire whose answers are already spent.
         * Same motion as "Plan this again" in the list, and the same helper,
         * so the two cannot come to mean different things.
         */
        onEdit={async () => {
          await draftFromPlan(plan);
          router.push("/plan/new");
        }}
        // Already saved, so this only has to hand back the slug it has.
        onSave={async () => plan.share_slug}
        shareSlug={plan.share_slug}
        saving={false}
      />
    </OccasionThemeProvider>
  );
}
