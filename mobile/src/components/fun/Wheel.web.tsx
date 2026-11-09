import { forwardRef, useImperativeHandle, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { useTheme } from "../../lib/useTheme";
import { useReducedMotion } from "../motion";

/** Bright enough to tell apart at a glance, dark enough for white words. */
const SEGMENT_COLOURS = ["#0F766E", "#C92C58", "#B7791F", "#55203A", "#2563EB", "#9E4A07", "#0E7490", "#7C3AED"];

export interface WheelHandle {
  /** Spins, and resolves to the index it landed on. */
  spin: () => Promise<number>;
}

/**
 * A wheel of fortune, drawn with plain views.
 *
 * There is no SVG library in the app, and a native one cannot arrive by an
 * over-the-air update, so each segment is a triangle made from borders, with
 * its point at the centre and its base far outside the rim, inside a round
 * frame that clips it to an arc. Each triangle and each label sits in a
 * full-size layer rotated about the wheel's centre, which needs no
 * transform-origin and so behaves the same on iOS and Android.
 *
 * The spin is on the JS driver, because the haptic tick as each segment
 * passes the pointer needs the angle as it changes, which a native-driven
 * animation never reports back.
 */
export const Wheel = forwardRef<WheelHandle, { labels: string[]; size?: number; onCentrePress?: () => void; centreLabel?: string }>(
  function Wheel({ labels, size = 300, onCentrePress, centreLabel = "SPIN" }, ref) {
    const c = useTheme();
    const reduced = useReducedMotion();
    const angle = useRef(new Animated.Value(0)).current;
    const current = useRef(0);
    const spinning = useRef(false);

    const n = Math.max(labels.length, 1);
    const seg = 360 / n;
    const R = size / 2;

    useImperativeHandle(
      ref,
      () => ({
        spin: () =>
          new Promise<number>((resolve) => {
            if (spinning.current || labels.length < 2) return resolve(-1);
            spinning.current = true;
            const winner = Math.floor(Math.random() * labels.length);
            /*
             * Segment i spans [i·seg, (i+1)·seg) clockwise from the top. With
             * the wheel turned clockwise by A, the pointer at the top reads the
             * wheel at -A, so landing on the winner's middle (plus a little
             * jitter, so it does not always stop dead centre) means A ≡ -mid.
             */
            const mid = winner * seg + seg / 2 + (Math.random() - 0.5) * seg * 0.6;
            const turns = reduced ? 1 : 5 + Math.floor(Math.random() * 2);
            const from = current.current;
            const settle = ((360 - mid - (from % 360)) % 360 + 360) % 360;
            const to = from + turns * 360 + settle;

            let lastTick = Math.floor(from / seg);
            let lastBuzz = 0;
            const id = angle.addListener(({ value }) => {
              const tick = Math.floor(value / seg);
              if (tick !== lastTick) {
                lastTick = tick;
                const now = Date.now();
                if (now - lastBuzz > 45) {
                  lastBuzz = now;
                  void Haptics.selectionAsync();
                }
              }
            });

            Animated.timing(angle, {
              toValue: to,
              duration: reduced ? 900 : 4200 + Math.random() * 700,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }).start(() => {
              angle.removeListener(id);
              current.current = to;
              spinning.current = false;
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              resolve(winner);
            });
          }),
      }),
      [angle, labels.length, reduced, seg]
    );

    const rotate = angle.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"], extrapolate: "extend" });

    // Long enough to pass the rim, wide enough for this segment's angle (with a sliver of overlap so no seams show).
    const H = R * 1.45;
    const half = n === 2 ? 0 : H * Math.tan(((seg / 2 + 0.7) * Math.PI) / 180);
    const chord = 2 * R * 0.6 * Math.sin(((Math.min(seg, 120) / 2) * Math.PI) / 180);
    const fontSize = n <= 3 ? 16 : n <= 5 ? 14 : 12;

    return (
      <View style={{ width: size, height: size + 18, alignItems: "center" }}>
        {/* The pointer, over the top of the wheel. */}
        <View
          style={{
            position: "absolute",
            top: 0,
            zIndex: 3,
            width: 0,
            height: 0,
            borderLeftWidth: 13,
            borderRightWidth: 13,
            borderTopWidth: 26,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: c.text,
          }}
        />
        <Animated.View
          style={{
            marginTop: 14,
            width: size,
            height: size,
            borderRadius: R,
            overflow: "hidden",
            backgroundColor: SEGMENT_COLOURS[0],
            borderWidth: 4,
            borderColor: c.backgroundElement,
            transform: [{ rotate }],
          }}
        >
          {labels.map((_, i) =>
            n === 2 ? (
              // Two segments are two halves; a triangle cannot open to 180°.
              <View
                key={`s${i}`}
                style={{ position: "absolute", top: 0, left: i === 0 ? R : 0, width: R, height: size, backgroundColor: SEGMENT_COLOURS[i] }}
              />
            ) : (
              <View
                key={`s${i}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: size,
                  height: size,
                  transform: [{ rotate: `${i * seg + seg / 2 - 180}deg` }],
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    left: R - half,
                    top: R,
                    width: 0,
                    height: 0,
                    borderLeftWidth: half,
                    borderRightWidth: half,
                    borderBottomWidth: H,
                    borderLeftColor: "transparent",
                    borderRightColor: "transparent",
                    borderBottomColor: SEGMENT_COLOURS[i % SEGMENT_COLOURS.length],
                  }}
                />
              </View>
            )
          )}

          {labels.map((label, i) => (
            <View
              key={`l${i}`}
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: size,
                height: size,
                transform: [{ rotate: `${i * seg + seg / 2}deg` }],
              }}
            >
              <View style={{ position: "absolute", top: R * 0.16, left: R - chord / 2, width: chord, alignItems: "center" }}>
                <Text
                  numberOfLines={2}
                  center
                  style={{
                    color: "#fff",
                    fontSize,
                    lineHeight: fontSize + 3,
                    fontWeight: "700",
                    textShadowColor: "rgba(0,0,0,0.35)",
                    textShadowRadius: 3,
                    textShadowOffset: { width: 0, height: 1 },
                  }}
                >
                  {label}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>

        {/* The hub: tapping it spins, for a thumb already there. */}
        <Pressable
          onPress={onCentrePress}
          accessibilityRole="button"
          accessibilityLabel="Spin the wheel"
          style={({ pressed }) => ({
            position: "absolute",
            top: 14 + R - 34,
            width: 68,
            height: 68,
            borderRadius: 34,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.backgroundElement,
            borderWidth: 3,
            borderColor: c.text,
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: "800", letterSpacing: 0.8, color: c.text }}>{centreLabel}</Text>
        </Pressable>
      </View>
    );
  }
);
