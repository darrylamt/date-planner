import { useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Mascot, SpeechBubble } from "../src/components/Mascot";
import { Symbol } from "../src/components/Symbol";
import { OccasionGrid } from "../src/components/home/OccasionGrid";
import { useReducedMotion } from "../src/components/motion";
import { GUTTER, Radius, Spacing } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { markOnboarded } from "../src/lib/onboarding";
import { startNewPlan } from "../src/lib/startPlan";
import type { Occasion } from "../src/lib/types";

interface Slide {
  occasion: Occasion;
  says: string;
  title: string;
  body: string;
}

/**
 * Three slides, then the first real choice: what are you planning?
 *
 * The old intro was four slides that asked nothing and ended on Home, where
 * a new person still had to work out where to start. Now the last step is
 * the occasion picker itself, and choosing opens the planner on its next
 * question, so the intro ends inside a plan rather than in front of one.
 *
 * Each slide wears a different costume, so the mascot's range is shown by
 * using it rather than explained. The third is the honest one: people are
 * about to hand over a budget, and saying plainly what we will and will not
 * do with it is worth more than another feature card.
 */
const SLIDES: Slide[] = [
  {
    occasion: "first_date",
    says: "Hello, I'm Duro.",
    title: "Tell us the occasion. We plan the whole outing.",
    body: "Somewhere to eat, something to do, somewhere to end up in Accra, timed one after another.",
  },
  {
    occasion: "date_night",
    says: "Budget first.",
    title: "Set a budget. See real prices.",
    body: "Prices come from each venue's own menu, with the Uber or Bolt between stops added in. The plan stays inside what you set.",
  },
  {
    occasion: "solo_day",
    says: "One promise.",
    title: "Only real places.",
    body: "We only suggest places we hold prices for. If we can't fill your outing, we say so instead of guessing.",
  },
];

/** The picker comes after the slides, and the dots count it as a step. */
const PICKER = SLIDES.length;
const STEPS = SLIDES.length + 1;

export default function Onboarding() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const picking = index === PICKER;

  /*
   * Swipe, because dots and a Next button look like something you swipe.
   *
   * PanResponder rather than a gesture-handler or reanimated version: it is in
   * React Native itself and needs no worklet. The gesture is only claimed once
   * the finger has clearly gone sideways, so the picker still scrolls and a tap
   * on Next still behaves.
   */
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -45) advance();
        else if (g.dx >= 45) retreat();
      },
    })
  ).current;

  /*
   * The gesture reads the step from a ref rather than from state.
   *
   * PanResponder is built once and keeps whatever it closed over, so a handler
   * reading `index` would act on the step that was showing when the screen
   * mounted. The ref is rewritten on every render and is always current.
   */
  const indexRef = useRef(0);
  indexRef.current = index;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (safety.current) clearTimeout(safety.current);
  }, []);

  /** Forward and back, stopping at the ends rather than wrapping. */
  function advance() {
    if (indexRef.current < PICKER) go(indexRef.current + 1);
  }

  function retreat() {
    if (indexRef.current > 0) go(indexRef.current - 1);
  }

  function go(next: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (reducedRef.current) {
      setIndex(next);
      return;
    }
    /*
     * Fade the copy out and back so the step changes as one movement.
     *
     * The JS driver, not the native one: native-driven entrances never started
     * in a modal on the phone and left the screen blank. And whatever happens
     * to the animation, the copy is back at full opacity shortly after.
     */
    Animated.timing(fade, {
      toValue: 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      setIndex(next);
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    });
    if (safety.current) clearTimeout(safety.current);
    safety.current = setTimeout(() => {
      setIndex(next);
      fade.setValue(1);
    }, 600);
  }

  /** Done with the intro, and nothing chosen: Home. */
  async function finish() {
    await markOnboarded();
    router.replace("/");
  }

  /**
   * Done, and straight into a plan for what they chose.
   *
   * Home goes underneath first, so Back from the planner lands somewhere
   * sensible rather than on the intro again. The push waits a tick so it is
   * not lost in the replace.
   */
  async function pick(occasion: Occasion) {
    void Haptics.selectionAsync();
    await markOnboarded();
    router.replace("/");
    setTimeout(() => void startNewPlan(occasion, "onboarding"), 0);
  }

  const slide = picking ? null : SLIDES[index];

  return (
    <View
      {...swipe.panHandlers}
      style={{
        flex: 1,
        backgroundColor: c.background,
        paddingTop: insets.top + Spacing.three,
        paddingBottom: (insets.bottom || Spacing.three) + Spacing.three,
      }}
    >
      {/* Skip goes to the choice, not past it: it is the one thing worth stopping for. */}
      <View style={{ alignItems: "flex-end", paddingHorizontal: GUTTER, minHeight: 20 }}>
        {picking ? null : (
          <Pressable onPress={() => go(PICKER)} hitSlop={12}>
            <Text variant="footnote" tone="secondary" weight="600">
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: fade }}>
        {slide ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: GUTTER,
            }}
          >
            <SpeechBubble text={slide.says} />
            <Mascot
              occasion={slide.occasion}
              size={132}
              animate={!reduced}
              style={{ marginTop: Spacing.two }}
            />
            <Text
              variant="title1"
              center
              style={{ marginTop: Spacing.five, paddingHorizontal: Spacing.two }}
            >
              {slide.title}
            </Text>
            <Text variant="body" tone="secondary" center style={{ marginTop: Spacing.three }}>
              {slide.body}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: Spacing.three, paddingBottom: Spacing.four }}
            showsVerticalScrollIndicator={false}
          >
            <Text variant="title1">What are you planning first?</Text>
            <Text variant="body" tone="secondary" style={{ marginTop: Spacing.one, marginBottom: Spacing.four }}>
              Pick one and we'll start there.
            </Text>
            <OccasionGrid onPick={(id) => void pick(id)} />
          </ScrollView>
        )}
      </Animated.View>

      {/* Progress */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: Spacing.two,
          marginTop: Spacing.three,
          marginBottom: Spacing.four,
        }}
      >
        {Array.from({ length: STEPS }, (_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? 20 : 7,
              height: 7,
              borderRadius: Radius.pill,
              backgroundColor: i === index ? c.accent : c.border,
            }}
          />
        ))}
      </View>

      <View style={{ paddingHorizontal: GUTTER, gap: Spacing.two }}>
        {picking ? (
          <Pressable
            onPress={() => void finish()}
            style={({ pressed }) => ({
              height: 52,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: c.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="headline" tone="secondary">
              Skip for now
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => go(index + 1)}
            style={({ pressed }) => ({
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
              {index === PICKER - 1 ? "Choose what you're planning" : "Next"}
            </Text>
            <Symbol name="arrow.right" size={14} color={c.textOnBrand} weight="semibold" />
          </Pressable>
        )}

        {index > 0 ? (
          <Pressable
            onPress={() => go(index - 1)}
            style={{ height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Text variant="footnote" tone="secondary" weight="600">
              Back
            </Text>
          </Pressable>
        ) : (
          <View style={{ height: 40 }} />
        )}
      </View>
    </View>
  );
}
