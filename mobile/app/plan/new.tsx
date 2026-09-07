import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/Text";
import { Button, ActionBar } from "../../src/components/Button";
import { PlanSteps } from "../../src/components/plan/PlanSteps";
import { ErrorState, LoadingPlan, NoMatch } from "../../src/components/plan/StatusScreens";
import { ItineraryView } from "../../src/components/plan/ItineraryView";
import { GUTTER, radius, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { generatePlan } from "../../src/lib/api";
import { SignInRequiredError, fetchAreas, savePlan } from "../../src/lib/data";
import { clearDraft, loadDraft, saveDraft } from "../../src/lib/draft";
import { TOTAL_STEPS, defaultInputs } from "../../src/lib/planConstants";
import { possessiveName } from "../../src/lib/pronouns";
import { longDate } from "../../src/lib/format";
import { supabase } from "../../src/lib/supabase";
import type { Area, GenerateResponse, Itinerary, PlanInputs } from "../../src/lib/types";

function isOccasion(v: string): v is PlanInputs["occasion"] {
  return ["first_date", "anniversary", "date_night", "friend_outing"].includes(v);
}

type Phase =
  | { name: "steps"; step: number }
  | { name: "loading" }
  | { name: "result"; itinerary: Itinerary }
  | { name: "no_match"; data: Extract<GenerateResponse, { status: "no_match" }> }
  | { name: "error"; message?: string };

export default function PlanNew() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  /**
   * `fresh` starts a new plan; without it this screen resumes the saved draft.
   *
   * Resuming used to be unconditional, which meant that once a plan had been
   * generated every entry point landed back on that finished itinerary — the
   * only available action was "Edit my answers", so a new plan could not be
   * started at all.
   */
  const params = useLocalSearchParams<{ occasion?: string; fresh?: string }>();

  const [inputs, setInputs] = useState<PlanInputs>(defaultInputs);
  const [phase, setPhase] = useState<Phase>({ name: "steps", step: 0 });
  const [areas, setAreas] = useState<Area[]>([]);
  const [areasFailed, setAreasFailed] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  /* Restore any in-progress plan, and load the area catalog. */
  useEffect(() => {
    let active = true;

    void (async () => {
      const startFresh = params.fresh === "1";
      const seeded = params.occasion;

      if (startFresh) {
        // Home has already confirmed replacing any existing draft.
        await clearDraft();
        const base = defaultInputs();
        const withOccasion =
          seeded && isOccasion(seeded) ? { ...base, occasion: seeded } : base;
        if (active) {
          setInputs(withOccasion);
          setPhase({ name: "steps", step: 0 });
          setShareSlug(null);
        }
        void saveDraft({ inputs: withOccasion, step: 0, itinerary: null, shareSlug: null });
      } else {
        const draft = await loadDraft();
        if (active && draft) {
          if (draft.inputs) setInputs(draft.inputs);
          if (draft.itinerary) setPhase({ name: "result", itinerary: draft.itinerary });
          else if (draft.step) setPhase({ name: "steps", step: draft.step });
          if (draft.shareSlug) setShareSlug(draft.shareSlug);
        }
      }

      if (active) setHydrated(true);
    })();

    fetchAreas()
      .then((rows) => active && setAreas(rows))
      .catch(() => active && setAreasFailed(true));

    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<PlanInputs>) => {
    setInputs((cur) => {
      const next = { ...cur, ...patch };
      void saveDraft({ inputs: next });
      return next;
    });
  }, []);

  const generate = useCallback(
    async (overrides?: Partial<PlanInputs>) => {
      const finalInputs = { ...inputs, ...overrides };
      if (overrides) update(overrides);

      setPhase({ name: "loading" });
      setShareSlug(null);
      void saveDraft({ shareSlug: null, itinerary: null });

      const data = await generatePlan(finalInputs);

      if (data.status === "ok") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhase({ name: "result", itinerary: data.itinerary });
        void saveDraft({ itinerary: data.itinerary });
      } else if (data.status === "no_match") {
        setPhase({ name: "no_match", data });
      } else {
        setPhase({ name: "error", message: data.message });
      }
    },
    [inputs, update]
  );

  /** Persist the plan; returns its share slug, or null if sign-in is needed. */
  const handleSave = useCallback(async (): Promise<string | null> => {
    if (shareSlug) return shareSlug;
    if (phase.name !== "result") return null;

    setSaving(true);
    try {
      const slug = await savePlan(inputs, phase.itinerary);
      setShareSlug(slug);
      void saveDraft({ shareSlug: slug });
      return slug;
    } catch (e) {
      if (e instanceof SignInRequiredError) {
        router.push("/login");
        return null;
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [inputs, phase, shareSlug]);

  /* Saving was blocked on sign-in — finish it once a session appears. */
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && phase.name === "result" && !shareSlug) {
        void handleSave();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [phase, shareSlug, handleSave]);

  /*
   * Header per phase. The result screen previously had no back button and sits
   * outside the tab group, so finishing a plan was a dead end — the only way
   * out was to force-quit. Every phase except generation now offers an exit.
   */
  useEffect(() => {
    if (phase.name === "steps") {
      navigation.setOptions({
        title: `${phase.step + 1} of ${TOTAL_STEPS}`,
        headerBackVisible: phase.step === 0,
        gestureEnabled: phase.step === 0,
      });
      return;
    }

    if (phase.name === "loading") {
      // Nothing to go back to mid-generation, and leaving would strand the call.
      navigation.setOptions({ title: "", headerBackVisible: false, gestureEnabled: false });
      return;
    }

    navigation.setOptions({
      title: phase.name === "result" ? longDate(inputs.date) : "",
      headerBackVisible: true,
      headerBackTitle: "Done",
      gestureEnabled: true,
    });
  }, [navigation, phase, inputs.date]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (phase.name === "loading") return <LoadingPlan inputs={inputs} />;

  if (phase.name === "no_match") {
    return (
      <NoMatch
        data={phase.data}
        onSuggestion={(s) => {
          if (s.action === "raise_budget" && s.value) {
            void generate({ budget: s.value });
          } else {
            void generate({ surpriseMe: true, areaIds: [], areaNames: [] });
          }
        }}
        onStartOver={() => {
          setInputs(defaultInputs());
          void clearDraft();
          setPhase({ name: "steps", step: 0 });
        }}
      />
    );
  }

  if (phase.name === "error") {
    return <ErrorState message={phase.message} onRetry={() => void generate()} />;
  }

  if (phase.name === "result") {
    return (
      <ItineraryView
        inputs={inputs}
        itinerary={phase.itinerary}
        onItineraryChange={(it) => {
          setPhase({ name: "result", itinerary: it });
          // Any edit invalidates the shared copy — it must be saved again.
          setShareSlug(null);
          void saveDraft({ itinerary: it, shareSlug: null });
        }}
        onEdit={() => setPhase({ name: "steps", step: TOTAL_STEPS - 1 })}
        onSave={handleSave}
        shareSlug={shareSlug}
        saving={saving}
      />
    );
  }

  /* ── Step screens ── */
  const step = phase.step;

  const goTo = (next: number) => {
    setPhase({ name: "steps", step: next });
    void saveDraft({ step: next });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const goBack = () => (step === 0 ? router.back() : goTo(step - 1));
  const goNext = () => (step === TOTAL_STEPS - 1 ? void generate() : goTo(step + 1));

  const canContinue =
    (step !== 0 || inputs.surpriseMe || inputs.areaIds.length > 0) &&
    (step !== 3 || inputs.vibes.length > 0);

  const poss = possessiveName(inputs.partner.name, inputs.partner.pronoun);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      {/* Progress rail */}
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: GUTTER, paddingBottom: space.lg }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: i <= step ? c.accent : c.backgroundSelected,
            }}
          />
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {step === 0 && areas.length === 0 ? (
          <View style={{ paddingTop: space.xxxl, paddingHorizontal: GUTTER }}>
            {areasFailed ? (
              <Text variant="body" tone="secondary" center>
                We could not load areas. Check your connection and try again.
              </Text>
            ) : (
              <ActivityIndicator color={c.accent} />
            )}
          </View>
        ) : (
          <PlanSteps step={step} inputs={inputs} areas={areas} update={update} />
        )}
      </ScrollView>

      <ActionBar style={{ paddingBottom: insets.bottom || space.lg }}>
        <Button
          title={step === TOTAL_STEPS - 1 ? `Build ${poss} evening` : "Continue"}
          icon={step === TOTAL_STEPS - 1 ? "sparkles" : undefined}
          onPress={goNext}
          disabled={!canContinue}
        />
        {step > 0 ? <Button title="Back" kind="plain" size="medium" onPress={goBack} /> : null}
      </ActionBar>
    </KeyboardAvoidingView>
  );
}
