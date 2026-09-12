import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Image } from "expo-image";
import { radius } from "../theme";
import { useTheme } from "../lib/useTheme";

/**
 * The mascots, drifting, as the top half of the sign-in screen.
 *
 * They already exist for every occasion and were only ever seen one at a time,
 * inside the plan flow. Sign-in is the one screen where showing the whole cast
 * says what the app is for before a word is read: this is not a utility, it is
 * somebody's evening out.
 *
 * Each one bobs on its own slow loop with its own phase, so the group never
 * pulses in unison, which is the thing that makes a screen look like a loading
 * state rather than a place.
 */
const CAST = [
  { src: require("../../assets/mascots/birthday.png"), size: 92, left: 0.08, top: 0.06, delay: 0 },
  { src: require("../../assets/mascots/date_night.png"), size: 74, left: 0.62, top: 0.02, delay: 900 },
  { src: require("../../assets/mascots/friend_outing.png"), size: 108, left: 0.34, top: 0.3, delay: 400 },
  { src: require("../../assets/mascots/celebration.png"), size: 68, left: 0.03, top: 0.52, delay: 1500 },
  { src: require("../../assets/mascots/graduation.png"), size: 80, left: 0.72, top: 0.46, delay: 700 },
];

function Floater({
  src,
  size,
  left,
  top,
  delay,
  width,
  height,
}: {
  src: number;
  size: number;
  left: number;
  top: number;
  delay: number;
  width: number;
  height: number;
}) {
  const c = useTheme();
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2600,
          delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, delay]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: width * left,
        top: height * top,
        transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }],
      }}
    >
      {/*
        A soft plate behind each sprite. The mascots are pixel art with
        transparent backgrounds, and on a plain wash they read as stickers
        someone forgot to remove; sitting them on a rounded tint makes them
        look placed.
      */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius.card,
          backgroundColor: c.backgroundElement,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          source={src}
          style={{ width: size * 0.74, height: size * 0.74 }}
          contentFit="contain"
          // Pixel art, so no smoothing on the way up.
          allowDownscaling={false}
        />
      </View>
    </Animated.View>
  );
}

export function FloatingMascots({ width, height }: { width: number; height: number }) {
  return (
    <View style={{ width, height }} pointerEvents="none">
      {CAST.map((m, i) => (
        <Floater key={i} {...m} width={width} height={height} />
      ))}
    </View>
  );
}
