import AsyncStorage from "@react-native-async-storage/async-storage";
import { newPlanKey, trackStops } from "../../src/lib/signals";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../../src/components/Text";
import { Symbol } from "../../src/components/Symbol";
import { Button, ActionBar } from "../../src/components/Button";
import { BareSteps, PlanSteps } from "../../src/components/plan/PlanSteps";
import { StepTip } from "../../src/components/plan/StepTip";
import { ErrorState, NoMatch } from "../../src/components/plan/StatusScreens";
import { ItineraryView } from "../../src/components/plan/ItineraryView";
import { GUTTER, radius, space } from "../../src/theme";
import { OccasionThemeProvider, useTheme } from "../../src/lib/useTheme";
import { generatePlan } from "../../src/lib/api";
import {
  SignInRequiredError,
  fetchAreas,
  fetchCuisines,
  fetchWellnessFloor,
  type WellnessFloors,
  savePlan,
} from "../../src/lib/data";
import { clearDraft, loadDraft, saveDraft } from "../../src/lib/draft";
import {
  OCCASION_IDS,
  clampParty,
  defaultBudgetFor,
  defaultStopsFor,
  defaultInputs,
  isOptionalStep,
  OCCASION_EXTRA,
  PARTY_RULES,
  stepsFor,
  vibesFor,
  type StepId,
  tidyForPathway,
  wellnessAllowed,
  wellnessKindsOf,
} from "../../src/lib/planConstants";
import { possessiveName, pronounForGender } from "../../src/lib/pronouns";
import { longDate, shortDate, time12 } from "../../src/lib/format";
import {
  BudgetDial,
  EnoughToPlan,
  OccasionCards,
  PeopleCounter,
  QuestionShell,
  SunTime,
  VibeDuel,
  occasionLabel,
} from "../../src/components/redesign/Questions";
import { PlanReveal } from "../../src/components/redesign/PlanReveal";
import { BuildingNight, DayPicker, ShapeNight } from "../../src/components/redesign/Questions2";
import { AreaMapView } from "../../src/components/redesign/AreaMapView";
import { Body, LookButton } from "../../src/components/look";
import { isDriving } from "../../src/lib/budget";
import { registerForPush } from "../../src/lib/push";
import { getAiConsent, setAiConsent } from "../../src/lib/aiConsent";
import { AiConsentSheet } from "../../src/components/AiConsentSheet";
import { supabase } from "../../src/lib/supabase";
import { record } from "../../src/lib/usage";
import type { Area, GenerateResponse, Itinerary, PlanInputs } from "../../src/lib/types";
import { SkeletonRows, SkeletonSteps } from "../../src/components/Skeleton";

/** Page fill, likewise resolved inside the provider. */
function ThemedPage({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <View style={{ flex: 1, backgroundColor: c.background }}>{children}</View>;
}

/**
 * Derived from the occasion list rather than written out, because a hand-kept
 * copy silently fell behind when four occasions were added: those cards passed
 * an occasion this rejected, so the pathway neither preselected it nor applied
 * it, and a birthday quietly started a date night.
 */
function isOccasion(v: string): v is PlanInputs["occasion"] {
  return (OCCASION_IDS as readonly string[]).includes(v);
}

type Phase =
  | { name: "steps"; step: number }
  | { name: "checkpoint" }
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
   * generated every entry point landed back on that finished itinerary, the
   * only available action was "Edit my answers", so a new plan could not be
   * started at all.
   */
  const params = useLocalSearchParams<{ occasion?: string; fresh?: string; from?: string; date?: string; start?: string }>();
  // Which entry point opened the planner, for counting (0085). Shape-checked, never trusted further.
  const entry = /^[a-z_]{1,32}$/.test(params.from ?? "") ? (params.from as PlanInputs["entry"]) : undefined;
  /*
   * A night chosen for them, like Halloween from Home. Only a real day from
   * today on, and a plain HH:MM; anything else leaves the usual defaults.
   */
  const todayISO = new Date().toISOString().slice(0, 10);
  const presetDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") && (params.date as string) >= todayISO ? params.date : undefined;
  const presetStart = /^([01]\d|2[0-3]):[0-5]\d$/.test(params.start ?? "") ? params.start : undefined;

  /**
   * Arriving from an occasion card means that question is answered, so the
   * pathway drops it rather than asking again.
   */
  const occasionPreset = Boolean(params.occasion && isOccasion(params.occasion));

  const [inputs, setInputs] = useState<PlanInputs>(defaultInputs);
  const [phase, setPhase] = useState<Phase>({ name: "steps", step: 0 });
  const [areas, setAreas] = useState<Area[]>([]);
  const [areasFailed, setAreasFailed] = useState(false);
  const [cuisines, setCuisines] = useState<{ id: string; label: string }[]>([]);
  const [wellnessFloors, setWellnessFloors] = useState<WellnessFloors | null>(null);
  /*
   * The pending consent question, and the answer it is waiting for. A ref
   * rather than state for the resolver, because it is a callback to finish a
   * generate that is already under way, not something to render.
   */
  const [askingConsent, setAskingConsent] = useState(false);
  const consentAnswer = useRef<((allowed: boolean) => void) | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // The reveal shows first (PlanReveal); the full plan, with swaps and menus, opens from it.
  const [full, setFull] = useState(false);
  // A dial, the sun or a loop on the map is being dragged: the page holds still.
  const [dragging, setDragging] = useState(false);

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
        const base = {
          ...defaultInputs(),
          ...(entry ? { entry } : {}),
          ...(presetDate ? { date: presetDate } : {}),
          ...(presetStart ? { startTime: presetStart } : {}),
        };
        const withOccasion =
          seeded && isOccasion(seeded)
            ? {
                ...base,
                occasion: seeded,
                // Enter at a legal size: friends starts at three, solo at one.
                partySize: clampParty(seeded, base.partySize),
                // And at a sensible shape: a meeting is one place.
                stops: defaultStopsFor(seeded),
                // And a budget that suits it (defaultBudgetFor).
                budget: defaultBudgetFor(seeded, clampParty(seeded, base.partySize)),
              }
            : base;
        if (active) {
          setInputs(withOccasion);
          setPhase({ name: "steps", step: 0 });
          setShareSlug(null);
        }
        void saveDraft({ inputs: withOccasion, step: 0, itinerary: null, shareSlug: null });
      } else {
        const draft = await loadDraft();
        // No draft to resume: a new plan, opened by a link or a shortcut. A draft keeps its own entry.
        if (active && !draft?.inputs) setInputs({ ...defaultInputs(), entry: entry ?? "deeplink" });
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

    /*
     * Not fatal if it fails. Areas decide where a plan can go and their
     * absence stops the questionnaire; the cuisine chips are an optional
     * refinement, so a failure here hides them and everything else carries
     * on. Silent for the same reason: there is nothing the person could do.
     */
    fetchCuisines()
      .then((rows) => active && setCuisines(rows))
      .catch(() => undefined);

    // Optional in the same way: without it the spa row simply is not offered.
    fetchWellnessFloor()
      .then((floors) => active && setWellnessFloors(floors))
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<PlanInputs>) => {
    setInputs((cur) => {
      const next = { ...cur, ...patch };
      /*
       * The budget follows the occasion and the party until the person sets
       * it (owner, 27 Oct 2026): a first date starts at GHS 1,500, a birthday
       * for six at 2,400. A budget that is not the starting one for where they
       * are has been set, by them or by a plan they repeated, and is theirs.
       */
      if (patch.budget !== undefined) next.budgetChosen = true;
      else if (patch.partySize !== undefined && patch.occasion === undefined) {
        const chosen = cur.budgetChosen || cur.budget !== defaultBudgetFor(cur.occasion, cur.partySize);
        if (!chosen) next.budget = defaultBudgetFor(next.occasion, next.partySize ?? cur.partySize);
      }
      if (patch.occasion && patch.occasion !== cur.occasion) {
        next.partySize = clampParty(patch.occasion, cur.partySize);
        next.companions = next.companions.slice(0, Math.max(0, next.partySize - 1));
        // Answers to the previous pathway's question do not belong to this one.
        next.occasionDetail = {};
        /*
         * A meeting is one place until somebody says otherwise.
         *
         * The stops question still gets asked and can still be changed; this
         * only moves the default off "up to you", which for this pathway would
         * infer a three-stop evening out of the clock and walk a client from a
         * cafe to a bar. Leaving the pathway puts the default back, so a plan
         * that started as a meeting does not quietly stay one stop long.
         */
        next.stops = defaultStopsFor(patch.occasion);
        // The party was clamped to the new occasion: the starting budget follows it.
        const chosen = cur.budgetChosen || cur.budget !== defaultBudgetFor(cur.occasion, cur.partySize);
        if (!chosen && patch.budget === undefined) next.budget = defaultBudgetFor(next.occasion, next.partySize);
      }
      /*
       * A spa belongs to one or two people. Growing the party, or moving to a
       * family day or a meeting, takes it off rather than carrying a choice
       * the plan is no longer allowed to honour.
       */
      if (next.wellness && !wellnessAllowed(next)) next.wellness = false;
      void saveDraft({ inputs: next });
      return next;
    });
  }, []);

  const generate = useCallback(
    async (overrides?: Partial<PlanInputs>) => {
      /*
       * Asked once, before the first plan's answers could reach Anthropic.
       * After that the stored answer stands until it is changed under You.
       */
      let consent = await getAiConsent();
      if (consent === null) {
        const allowed = await new Promise<boolean>((resolve) => {
          consentAnswer.current = resolve;
          setAskingConsent(true);
        });
        consent = allowed ? "granted" : "declined";
        await setAiConsent(consent);
      }

      // Answers to questions this pathway never asked are dropped first.
      const merged = { ...inputs, ...overrides, ai: consent === "granted" };
      // Always said, so the plan log can tell a kept starting budget from a chosen one (0097).
      merged.budgetChosen = Boolean(merged.budgetChosen || overrides?.budget !== undefined || merged.budget !== defaultBudgetFor(merged.occasion, merged.partySize));
      const finalInputs = tidyForPathway(merged);
      if (overrides) update(overrides);

      setPhase({ name: "loading" });
      setShareSlug(null);
      void saveDraft({ shareSlug: null, itinerary: null });

      const data = await generatePlan(finalInputs);

      if (data.status === "ok") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // A key for this plan, kept through swaps and saving, and its stops counted as shown (signals.ts).
        const itinerary = { ...data.itinerary, plan_key: newPlanKey() };
        trackStops("shown", itinerary, finalInputs.occasion);
        setFull(false);
        setPhase({ name: "result", itinerary });
        void saveDraft({ itinerary });
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
      // The stops they kept: the strongest thing a plan can say about a place.
      if (slug) trackStops("saved", phase.itinerary, inputs.occasion);
      void saveDraft({ shareSlug: slug });
      // Home stops explaining how it works once somebody has saved a plan.
      void AsyncStorage.setItem("duro.firstSave.v1", "1").catch(() => undefined);

      /*
       * Ask about reminders here, and nowhere else.
       *
       * iOS lets an app ask exactly once. Asked on first launch, before
       * anybody has a plan, most people decline a question they have no
       * reason to answer yet and the refusal is final until they go looking
       * in Settings. Asked here, they have just saved an evening for a future
       * date and a reminder the night before is obviously for them.
       *
       * Only for a plan that has not happened yet: offering to remind somebody
       * about tonight, or about last Tuesday, is the prompt arriving when it
       * cannot be useful, which is how a permission gets spent.
       *
       * Not awaited. The plan is saved either way and a permission dialog must
       * not sit between somebody and the slug they asked for.
       */
      const today = new Date().toISOString().slice(0, 10);
      if (inputs.date > today) void registerForPush();

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

  /**
   * The pathway for this occasion. Recomputed from inputs, so changing the
   * occasion mid-flow reshapes the remaining questions rather than leaving
   * someone on a step that no longer applies.
   */
  const asked = stepsFor(inputs.occasion, occasionPreset);
  // "How many places" is asked inside Shape the night (Questions2.tsx), not on its own.
  const steps = asked.includes("shape") ? asked.filter((id) => id !== "stops") : asked;

  /*
   * Each question reached, for where people stop (usage_events, 0097): the
   * step, its place in the pathway and the occasion. Not the answers.
   */
  const shownStep = phase.name === "steps" ? steps[Math.min(phase.step, steps.length - 1)] : null;
  const shownIndex = phase.name === "steps" ? Math.min(phase.step, steps.length - 1) : -1;
  useEffect(() => {
    if (!hydrated || !shownStep) return;
    record("step_viewed", { name: shownStep, value: shownIndex, data: { occasion: inputs.occasion, of: steps.length, entry: inputs.entry ?? "none" } });
    // Once per step reached, not on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, shownStep, shownIndex]);
  const totalSteps = steps.length;

  /* Saving was blocked on sign-in, finish it once a session appears. */
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
   * outside the tab group, so finishing a plan was a dead end, the only way
   * out was to force-quit. Every phase except generation now offers an exit.
   */
  useEffect(() => {
    // The redesigned questions, the checkpoint and the reveal draw their own header.
    const own =
      phase.name === "steps" || phase.name === "checkpoint" || phase.name === "loading" || (phase.name === "result" && !full);
    navigation.setOptions({ headerShown: !own });
    if (own) {
      navigation.setOptions({ gestureEnabled: phase.name === "steps" && phase.step === 0 });
      return;
    }
    /**
     * Close is always available, and always safe: answers are written to the
     * draft on every change, so leaving keeps the plan on the home screen
     * under In progress rather than throwing it away.
     */
    const closeButton = () => (
      <Pressable
        onPress={() => router.dismissTo("/")}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{ padding: 4 }}
      >
        <Symbol name="xmark" size={17} weight="semibold" />
      </Pressable>
    );


    navigation.setOptions({
      title: phase.name === "result" ? longDate(inputs.date) : "",
      headerBackVisible: true,
      headerBackTitle: "Done",
      gestureEnabled: true,
      headerRight: closeButton,
    });
  }, [navigation, phase, inputs.date, totalSteps, full]);

  if (!hydrated) {
    return (
      <SkeletonSteps />
    );
  }

  /** Everything below is inside the pathway, so it wears the occasion's theme. */
  const themed = (node: React.ReactNode) => (
    <OccasionThemeProvider occasion={inputs.occasion}>
      <ThemedPage>{node}</ThemedPage>
    </OccasionThemeProvider>
  );

  if (phase.name === "loading") {
    return (
      <BuildingNight
        inputs={inputs}
        chips={[
          occasionLabel(inputs.occasion),
          inputs.partySize === 1 ? "Just you" : `${inputs.partySize} people`,
          inputs.surpriseMe ? "Anywhere good" : inputs.near ? "Near you" : inputs.areaNames.slice(0, 2).join(" & ") || inputs.city || "Accra",
          `GHS ${inputs.budget.toLocaleString()}`,
          shortDate(inputs.date),
          time12(inputs.startTime),
        ]}
      />
    );
  }

  if (phase.name === "no_match") {
    return themed(
      <NoMatch
        data={phase.data}
        onSuggestion={(s) => {
          if (s.action === "raise_budget" && s.value) {
            void generate({ budget: s.value });
          } else if (s.action === "clear_focus") {
            void generate({ focus: "everything", focuses: [] });
          } else if (s.action === "clear_wellness") {
            void generate({ wellness: false });
          } else if (s.action === "include_estimates") {
            void generate({ estimates: true });
          } else if (s.action === "clear_event_night") {
            void generate({ eventNight: false });
          } else {
            void generate({ surpriseMe: true, areaIds: [], areaNames: [] });
          }
        }}
        onEditAnswers={() => {
          setPhase({ name: "steps", step: 0 });
          void saveDraft({ step: 0, itinerary: null, shareSlug: null });
        }}
      />
    );
  }

  if (phase.name === "error") {
    return themed(<ErrorState message={phase.message} onRetry={() => void generate()} />);
  }

  if (phase.name === "result" && !full) {
    return (
      <PlanReveal
        itinerary={phase.itinerary}
        inputs={inputs}
        saving={saving}
        saved={Boolean(shareSlug)}
        onSave={() => void handleSave()}
        onOpenFull={() => setFull(true)}
        onClose={() => router.dismissTo("/")}
      />
    );
  }

  if (phase.name === "result") {
    return themed(
      <ItineraryView
        inputs={inputs}
        itinerary={phase.itinerary}
        onItineraryChange={(it) => {
          setPhase({ name: "result", itinerary: it });
          // Any edit invalidates the shared copy, it must be saved again.
          setShareSlug(null);
          void saveDraft({ itinerary: it, shareSlug: null });
        }}
        onEdit={() => setPhase({ name: "steps", step: totalSteps - 1 })}
        onSave={handleSave}
        shareSlug={shareSlug}
        saving={saving}
        askVibe
      />
    );
  }

  /* ── Step screens ── */
  const step = phase.name === "steps" ? phase.step : 0;

  const goTo = (next: number) => {
    setPhase({ name: "steps", step: next });
    void saveDraft({ step: next });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Clamped: changing the occasion mid-flow can shorten the pathway under us.
  const stepIndex = Math.min(step, totalSteps - 1);
  const stepId = steps[stepIndex];

  const goBack = () => (stepIndex === 0 ? router.back() : goTo(stepIndex - 1));

  /*
   * The floor for what they chose: one of each treatment, so the kinds add up.
   * "Surprise me" is the cheapest single treatment of any kind.
   */
  const wellnessFloor = (() => {
    if (!wellnessFloors) return null;
    const kinds = wellnessKindsOf(inputs);
    if (!kinds.length) {
      const all = Object.values(wellnessFloors).filter((n): n is number => n != null);
      return all.length ? Math.min(...all) : null;
    }
    const each = kinds.map((k) => wellnessFloors[k]);
    return each.every((n) => n != null) ? (each as number[]).reduce((t, n) => t + n, 0) : null;
  })();

  const canContinue =
    (stepId !== "area" || inputs.surpriseMe || inputs.areaIds.length > 0 || Boolean(inputs.near)) &&

    // The spa floor: the cheapest real treatment, for everybody coming.
    (stepId !== "budget" ||
      !inputs.wellness ||
      wellnessFloor == null ||
      inputs.budget >= Math.round(wellnessFloor * inputs.partySize));

  const poss = possessiveName(inputs.partner.name, pronounForGender(inputs.partner.gender));

  // Where the optional questions start in this pathway, and whether we are in them.
  const optionalFrom = (() => {
    const i = steps.findIndex((id) => isOptionalStep(id, inputs.occasion));
    return i === -1 ? totalSteps : i;
  })();
  const optional = stepIndex >= optionalFrom;
  const lastStep = stepIndex === totalSteps - 1;

  const goNext = () => {
    if (lastStep) return void generate();
    // The essentials are done: say so, and offer to build now (owner, 2 Nov 2026).
    if (stepIndex === optionalFrom - 1 && optionalFrom < totalSteps) return setPhase({ name: "checkpoint" });
    goTo(stepIndex + 1);
  };

  const consentSheet = (
    <AiConsentSheet
      purpose={askingConsent ? "plan" : null}
      onAnswer={(allowed) => {
        setAskingConsent(false);
        consentAnswer.current?.(allowed);
        consentAnswer.current = null;
      }}
    />
  );

  const whereText = inputs.surpriseMe
    ? "Anywhere good"
    : inputs.near
      ? "Near you"
      : inputs.areaNames.slice(0, 2).join(" & ") || inputs.city || "Accra";

  if (phase.name === "checkpoint") {
    return (
      <>
        {consentSheet}
        <EnoughToPlan
          rows={[
            { label: "Who", value: `${occasionLabel(inputs.occasion)} · ${inputs.partySize === 1 ? "just you" : `${inputs.partySize} people`}` },
            { label: "Where", value: whereText },
            { label: "Budget", value: `GHS ${inputs.budget.toLocaleString()}` },
            { label: "When", value: `${longDate(inputs.date)}, ${time12(inputs.startTime)}` },
          ]}
          optionalCount={totalSteps - optionalFrom}
          onBuild={() => void generate()}
          onMore={() => goTo(optionalFrom)}
          onBack={() => goTo(optionalFrom - 1)}
        />
      </>
    );
  }

  /* The answers so far, as chips above each question. */
  const done = new Set(steps.slice(0, stepIndex));
  const chips = [
    done.has("occasion") || occasionPreset ? occasionLabel(inputs.occasion) : null,
    done.has("party") ? (inputs.partySize === 1 ? "Just you" : `${inputs.partySize} people`) : null,
    done.has("area") ? whereText : null,
    done.has("budget") ? `GHS ${inputs.budget.toLocaleString()}` : null,
    done.has("when") ? shortDate(inputs.date) : null,
    done.has("timing") ? time12(inputs.startTime) : null,
  ].filter((x): x is string => Boolean(x));

  const extra = OCCASION_EXTRA[inputs.occasion];
  const TITLES: Record<StepId, { title: string; subtitle?: string }> = {
    occasion: { title: "What's the occasion?", subtitle: "It shapes everything after." },
    party: { title: PARTY_RULES[inputs.occasion].fixed ? "Who's coming?" : "How many of you?" },
    extra: { title: extra?.title ?? "A little more", subtitle: extra?.subtitle },
    area: { title: `Where in ${inputs.city || "Accra"}?`, subtitle: "Up to four areas, near you, or let us choose." },
    budget: {
      title: "What's the budget?",
      subtitle: isDriving(inputs) ? "Everything, and no fares: you're driving." : "Food and rides included.",
    },
    when: { title: "Which day?" },
    timing: { title: "What time?", subtitle: "We fit each stop around it, travel included." },
    details: { title: "Anything we should know?", subtitle: "All optional." },
    vibe: { title: "More like this, or that?" },
    shape: { title: "Shape the night", subtitle: "How many places, and what kind. Or leave it to us." },
    stops: { title: "How many places?", subtitle: "We'll fit them to the time you have." },
  };

  // What the old steps still draw under the new controls: settings, names, choices.
  const settings = (
    <BareSteps.Provider value={true}>
      <View style={{ marginHorizontal: -GUTTER }}>
        <PlanSteps
          step={stepId}
          inputs={inputs}
          areas={areas}
          cuisines={cuisines}
          wellnessFloor={wellnessFloor}
          wellnessFloors={wellnessFloors}
          update={update}
        />
      </View>
    </BareSteps.Provider>
  );

  const body =
    stepId === "occasion" ? (
      <OccasionCards
        value={inputs.occasion}
        onPick={(id) => {
          update({ occasion: id });
          // A card is an answer: on to the next question.
          setTimeout(() => goTo(stepIndex + 1), 180);
        }}
      />
    ) : stepId === "party" ? (
      <>
        <PeopleCounter inputs={inputs} update={update} />
        {settings}
      </>
    ) : stepId === "budget" ? (
      <>
        <BudgetDial inputs={inputs} update={update} onDragging={setDragging} />
        {settings}
      </>
    ) : stepId === "timing" ? (
      <>
        <SunTime value={inputs.startTime} onChange={(startTime) => update({ startTime })} onDragging={setDragging} />
        {settings}
      </>
    ) : stepId === "vibe" ? (
      <>
        <VibeDuel options={vibesFor(inputs.occasion, inputs.partySize)} inputs={inputs} update={update} />
        {settings}
      </>
    ) : stepId === "when" ? (
      <DayPicker value={inputs.date} onChange={(date) => update({ date })} />
    ) : stepId === "shape" ? (
      <>
        <ShapeNight inputs={inputs} update={update} />
        {settings}
      </>
    ) : stepId === "area" && areas.length > 0 ? (
      <>
        <AreaMapView areas={areas} inputs={inputs} city={inputs.city || "Accra"} update={update} onDragging={setDragging} />
        {settings}
      </>
    ) : stepId === "area" && areas.length === 0 ? (
      areasFailed ? (
        <Body tone="secondary">We could not load areas. Check your connection and try again.</Body>
      ) : (
        <SkeletonRows rows={6} thumb={0} />
      )
    ) : (
      settings
    );

  const label = optional
    ? `${stepIndex - optionalFrom + 1} of ${totalSteps - optionalFrom}`
    : `${stepIndex + 1} of ${optionalFrom}`;

  return (
    <>
      {consentSheet}
      <QuestionShell
        progress={(stepIndex + 1) / totalSteps}
        label={label}
        onBack={goBack}
        onSkip={optional && !lastStep ? goNext : undefined}
        chips={chips}
        title={TITLES[stepId].title}
        subtitle={TITLES[stepId].subtitle}
        scrollEnabled={!dragging}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            {optional && !lastStep ? (
              <LookButton label="Build now" kind="outline" onPress={() => void generate()} disabled={!canContinue} style={{ flex: 1 }} />
            ) : null}
            <LookButton
              label={lastStep ? `Build ${poss} plan` : optional ? "Next" : "Continue"}
              onPress={goNext}
              disabled={!canContinue}
              style={{ flex: 1 }}
            />
          </View>
        }
      >
        {body}
      </QuestionShell>
    </>
  );
}
