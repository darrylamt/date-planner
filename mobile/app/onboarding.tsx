import { useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Mascot, SpeechBubble } from "../src/components/Mascot";
import { Symbol } from "../src/components/Symbol";
import { GUTTER, HAIRLINE, Radius, Spacing } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { markOnboarded } from "../src/lib/onboarding";
import type { Occasion } from "../src/lib/types";

interface Slide {
  occasion: Occasion;
  says: string;
  title: string;
  body: string;
}

/**
 * Four slides, each fronted by a different costume — so the mascot's range is
 * shown by using it rather than explained.
 *
 * The last slide is the honest one. People are about to hand over a budget and
 * details about someone they like, and saying plainly what happens to that is
 * worth more than a fourth feature card.
 */
const SLIDES: Slide[] = [
  {
    occasion: "first_date",
    says: "Hello. I plan evenings.",
    title: "A whole evening, not a list of places.",
    body: "Dinner, then something to do, then somewhere to end up — timed back to back so you are never standing about wondering what next.",
  },
  {
    occasion: "date_night",
    says: "Real menus. Real prices.",
    title: "You will know what it costs before you go.",
    body: "Every stop is priced from an actual menu, with transport between them estimated on top. If it does not fit your budget, we say so instead of quietly going over.",
  },
  {
    occasion: "friend_outing",
    says: "Two of you, six of you, or just you.",
    title: "Built around who is actually coming.",
    body: "A first date, a birthday, friends out, or a day on your own. Tell us the occasion and the questions change to match.",
  },
  {
    occasion: "solo_day",
    says: "One promise before we start.",
    title: "We never invent a place.",
    body: "Every venue is a real one we have checked. If we cannot fill your evening honestly, we tell you — we would rather show you nothing than send you somewhere that is not there.",
  },
];

export default function Onboarding() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  function go(next: number) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Fade the copy out and back so the slide changes as one movement rather
    // than three elements swapping at slightly different times.
    Animated.timing(fade, {
      toValue: 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setIndex(next);
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }

  async function finish() {
    await markOnboarded();
    router.replace("/");
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        paddingTop: insets.top + Spacing.three,
        paddingBottom: (insets.bottom || Spacing.three) + Spacing.three,
      }}
    >
      {/* Skip. Always available — an intro nobody can leave is a trap. */}
      <View style={{ alignItems: "flex-end", paddingHorizontal: GUTTER }}>
        <Pressable onPress={finish} hitSlop={12}>
          <Text variant="footnote" tone="secondary" weight="600">
            Skip
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: GUTTER,
        }}
      >
        <Animated.View style={{ opacity: fade, alignItems: "center" }}>
          <SpeechBubble text={slide.says} />
          <Mascot occasion={slide.occasion} size={132} style={{ marginTop: Spacing.two }} />

          <Text
            variant="title1"
            center
            style={{ marginTop: Spacing.five, paddingHorizontal: Spacing.two }}
          >
            {slide.title}
          </Text>
          <Text
            variant="body"
            tone="secondary"
            center
            style={{ marginTop: Spacing.three }}
          >
            {slide.body}
          </Text>
        </Animated.View>
      </View>

      {/* Progress */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: Spacing.two,
          marginBottom: Spacing.four,
        }}
      >
        {SLIDES.map((_, i) => (
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
        <Pressable
          onPress={() => (last ? void finish() : go(index + 1))}
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
            {last ? "Plan my first date" : "Next"}
          </Text>
          <Symbol
            name="arrow.right"
            size={14}
            color={c.textOnBrand}
            weight="semibold"
          />
        </Pressable>

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
          <View style={{ height: 40, borderColor: c.border, borderWidth: 0 }} />
        )}
      </View>
      <View style={{ height: HAIRLINE }} />
    </View>
  );
}
