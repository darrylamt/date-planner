import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Text } from "./Text";
import { Elevation, HAIRLINE, Radius, Spacing } from "../theme";
import { useTheme } from "../lib/useTheme";
import type { Occasion } from "../lib/types";

/**
 * The aduro mascot: one character, one costume per occasion, three frames each.
 *
 * Paths are written out rather than built from a template because Metro
 * resolves require() at build time — a computed path bundles nothing and fails
 * at runtime with a missing asset.
 */
const SPRITES: Record<Occasion, { idle: number; bounce: number; blink: number }> = {
  first_date: {
    idle: require("../../assets/mascots/first_date.png"),
    bounce: require("../../assets/mascots/first_date_bounce.png"),
    blink: require("../../assets/mascots/first_date_blink.png"),
  },
  anniversary: {
    idle: require("../../assets/mascots/anniversary.png"),
    bounce: require("../../assets/mascots/anniversary_bounce.png"),
    blink: require("../../assets/mascots/anniversary_blink.png"),
  },
  date_night: {
    idle: require("../../assets/mascots/date_night.png"),
    bounce: require("../../assets/mascots/date_night_bounce.png"),
    blink: require("../../assets/mascots/date_night_blink.png"),
  },
  birthday: {
    idle: require("../../assets/mascots/birthday.png"),
    bounce: require("../../assets/mascots/birthday_bounce.png"),
    blink: require("../../assets/mascots/birthday_blink.png"),
  },
  graduation: {
    idle: require("../../assets/mascots/graduation.png"),
    bounce: require("../../assets/mascots/graduation_bounce.png"),
    blink: require("../../assets/mascots/graduation_blink.png"),
  },
  celebration: {
    idle: require("../../assets/mascots/celebration.png"),
    bounce: require("../../assets/mascots/celebration_bounce.png"),
    blink: require("../../assets/mascots/celebration_blink.png"),
  },
  friend_outing: {
    idle: require("../../assets/mascots/friend_outing.png"),
    bounce: require("../../assets/mascots/friend_outing_bounce.png"),
    blink: require("../../assets/mascots/friend_outing_blink.png"),
  },
  solo_day: {
    idle: require("../../assets/mascots/solo_day.png"),
    bounce: require("../../assets/mascots/solo_day_bounce.png"),
    blink: require("../../assets/mascots/solo_day_blink.png"),
  },
};

/**
 * Frame order. Mostly a two-frame breath, with a blink dropped in once per
 * cycle — a blink on every other frame reads as a twitch.
 */
const CYCLE: ("idle" | "bounce" | "blink")[] = [
  "idle",
  "bounce",
  "idle",
  "bounce",
  "idle",
  "blink",
  "idle",
  "bounce",
];

const FRAME_MS = 420;

export function Mascot({
  occasion,
  size = 96,
  animate = true,
  style,
}: {
  occasion: Occasion;
  size?: number;
  animate?: boolean;
  style?: ViewStyle;
}) {
  const [frame, setFrame] = useState(0);
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % CYCLE.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [animate]);

  useEffect(() => {
    if (!animate) return;
    // A slow float on top of the frame cycle, so the character drifts rather
    // than sitting rigidly on a baseline.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animate, sway]);

  const translateY = sway.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const set = SPRITES[occasion] ?? SPRITES.date_night;
  const source = animate ? set[CYCLE[frame]] : set.idle;

  return (
    <Animated.View style={[{ transform: animate ? [{ translateY }] : [] }, style]}>
      <View style={{ width: size, height: size }}>
        <Image
          source={source}
          style={{ width: size, height: size }}
          contentFit="contain"
          // No fade: cross-fading between frames turns a two-frame cycle into
          // a smear instead of an animation.
          transition={0}
        />
      </View>
    </Animated.View>
  );
}

/**
 * Speech bubble. Sits above the mascot with a tail pointing down at it, and
 * fades its text when the line changes rather than swapping mid-sentence.
 */
export function SpeechBubble({
  text,
  align = "center",
}: {
  text: string;
  align?: "left" | "center";
}) {
  const c = useTheme();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [text, fade]);

  return (
    <Animated.View style={{ opacity: fade, alignItems: align === "center" ? "center" : "flex-start" }}>
      <View
        style={[
          {
            backgroundColor: c.backgroundElement,
            borderRadius: Radius.xl,
            borderWidth: HAIRLINE,
            borderColor: c.border,
            paddingHorizontal: Spacing.three,
            paddingVertical: Spacing.two + 2,
            maxWidth: 300,
          },
          Elevation.card,
        ]}
      >
        <Text variant="callout" center={align === "center"}>
          {text}
        </Text>
      </View>

      {/* Tail. Two stacked squares read as a pixel-art tail, which matches the
          character better than a smooth triangle would. */}
      <View
        style={{
          width: 12,
          height: 6,
          backgroundColor: c.backgroundElement,
          borderLeftWidth: HAIRLINE,
          borderRightWidth: HAIRLINE,
          borderColor: c.border,
          marginLeft: align === "center" ? 0 : Spacing.five,
        }}
      />
      <View
        style={{
          width: 6,
          height: 5,
          backgroundColor: c.backgroundElement,
          borderLeftWidth: HAIRLINE,
          borderRightWidth: HAIRLINE,
          borderBottomWidth: HAIRLINE,
          borderColor: c.border,
          marginLeft: align === "center" ? 0 : Spacing.five + 3,
        }}
      />
    </Animated.View>
  );
}
