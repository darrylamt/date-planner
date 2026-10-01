import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Glow } from "./Glow";
import { useReducedMotion } from "../motion";
import { Radius, Spacing } from "../../theme";
import { useTheme } from "../../lib/useTheme";

const PALETTE = ["#7C5CFF", "#FF5CA8", "#FFB020", "#33D6C7"];
const HEIGHT = 54;
const RING = 2;

/*
 * What to say on the bar: its name, then the kind of thing it answers, so
 * somebody sees what it is for before they decide whether to tap it.
 */
// Short enough to fit beside the avatar on the narrowest iPhone.
const LINES = [
  "Ask adurobot",
  "“Quiet dinner in Osu?”",
  "“Plan Saturday for four”",
  "“Best jollof under 100?”",
  "“Ideas for her birthday?”",
  "“Open late on Monday?”",
];

/** Blend two hex colours, t from 0 to 1. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

/** The wheel of colour that turns behind the ring: 24 slices blending round the palette. */
const SLICES = Array.from({ length: 24 }, (_, i) => {
  const at = (i / 24) * PALETTE.length;
  const from = Math.floor(at) % PALETTE.length;
  return mix(PALETTE[from], PALETTE[(from + 1) % PALETTE.length], at - Math.floor(at));
});

/**
 * The way to adurobot on Home.
 *
 * The bar is always fully there; every movement is on top of it, so nothing
 * here can leave the button missing if an animation does not run. The ring
 * of colour turns slowly round its edge, a light passes across it now and
 * then, the sparkle twinkles, and the words turn over between its name and
 * the questions it answers. All of it rests under Reduce Motion.
 */
export function AskBar({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);

  const spin = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  // Decoration only, so the native driver: if it does not run, the bar is still.
  useEffect(() => {
    if (reduced) return;
    const turning = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
    );
    const passing = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const sparkling = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(2200),
      ])
    );
    turning.start();
    passing.start();
    sparkling.start();
    return () => {
      turning.stop();
      passing.stop();
      sparkling.stop();
    };
  }, [reduced, spin, sweep, twinkle]);

  const springTo = (v: number) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v === 1 ? 10 : 0 }).start();

  // The wheel is a circle wide enough that its edge is beyond the bar's corners at every angle.
  const wheel = Math.ceil(Math.hypot(width, HEIGHT)) + 8;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask adurobot"
      onPressIn={() => springTo(0.97)}
      onPressOut={() => springTo(1)}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{ flex: 1 }}
    >
      <Animated.View style={{ transform: [{ scale: press }] }}>
        <Glow colors={["#7C5CFF", "#FF5CA8"]}>
          <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ height: HEIGHT, borderRadius: Radius.pill, overflow: "hidden", padding: RING, backgroundColor: PALETTE[0] }}
          >
            {/* ── the turning ring ── */}
            {width ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: wheel,
                  height: wheel,
                  left: (width - wheel) / 2,
                  top: (HEIGHT - wheel) / 2,
                  transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
                }}
              >
                {SLICES.map((color, i) => (
                  <View
                    key={i}
                    style={{
                      position: "absolute",
                      left: wheel / 2 - wheel * 0.15,
                      top: 0,
                      width: wheel * 0.3,
                      height: wheel / 2,
                      backgroundColor: color,
                      transformOrigin: "50% 100%",
                      transform: [{ rotate: `${(i * 360) / SLICES.length}deg` }],
                    }}
                  />
                ))}
              </Animated.View>
            ) : null}

            {/* ── the face ── */}
            <View
              style={{
                flex: 1,
                borderRadius: Radius.pill,
                backgroundColor: c.backgroundElement,
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.two,
                paddingHorizontal: Spacing.three - RING,
                overflow: "hidden",
              }}
            >
              {/* A light passing across the face every few seconds. */}
              {width && !reduced ? (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: -10,
                    bottom: -10,
                    width: 46,
                    backgroundColor: c.accentSoft,
                    opacity: 0.9,
                    transform: [
                      { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, width + 40] }) },
                      { rotate: "18deg" },
                    ],
                  }}
                />
              ) : null}

              <Animated.View
                style={{
                  transform: [
                    { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] }) },
                    { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "18deg"] }) },
                  ],
                }}
              >
                <Symbol name="sparkles" size={21} color={c.accent} />
              </Animated.View>

              <View style={{ flex: 1, height: HEIGHT - RING * 2, justifyContent: "center", overflow: "hidden" }}>
                <TurningLine reduced={reduced} />
              </View>

              <Symbol name="chevron.right" size={14} color={c.textTertiary} />
            </View>
          </View>
        </Glow>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The words, turning over every few seconds: the current line lifts away and
 * the next rises in. On the JS driver with a safety, because these are the
 * button's words and must never be left invisible.
 */
function TurningLine({ reduced }: { reduced: boolean }) {
  const c = useTheme();
  const [i, setI] = useState(0);
  const v = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      setI(0);
      v.setValue(1);
      return;
    }
    let safety: ReturnType<typeof setTimeout> | undefined;
    const t = setInterval(() => {
      Animated.timing(v, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => {
        setI((n) => (n + 1) % LINES.length);
        v.setValue(-1);
        Animated.spring(v, { toValue: 1, useNativeDriver: false, speed: 16, bounciness: 6 }).start();
      });
      // However this turn goes, the words land once it should be over.
      clearTimeout(safety);
      safety = setTimeout(() => v.setValue(1), 1200);
    }, 3400);
    return () => {
      clearInterval(t);
      clearTimeout(safety);
    };
  }, [reduced, v]);

  const quote = i > 0;
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 0, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [14, -12, 0] }) }],
      }}
    >
      <Text
        variant={quote ? "subheadline" : "headline"}
        weight={quote ? "500" : "600"}
        numberOfLines={1}
        style={{ color: quote ? c.textSecondary : c.text, fontStyle: quote ? "italic" : "normal" }}
      >
        {LINES[i]}
      </Text>
    </Animated.View>
  );
}
