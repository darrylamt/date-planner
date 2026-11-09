import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Easing, runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { Canvas, Circle, Group, Path, RadialGradient, Skia, Text as SkText, useFont, vec } from "@shopify/react-native-skia";
import { useLook } from "../../lib/appearance";
import { KENTE } from "../../lib/looks";
import { useReducedMotion } from "../motion";

/**
 * The spin wheel, drawn in Skia (redesign, 2 Nov 2026): real segments in the
 * look's colours with a sheen over them, the names round the rim, a tick of
 * the phone as each segment passes the pointer, and a settle that slows to a
 * stop. The same handle as before, so Where next spins it the same way. On
 * the web, Wheel.web.tsx draws the older wheel.
 */
export interface WheelHandle {
  /** Spins to a random segment and resolves with its index, or -1 if it cannot spin. */
  spin: () => Promise<number>;
}

const FIGTREE_BOLD = require("@expo-google-fonts/figtree/700Bold/Figtree_700Bold.ttf");

export const Wheel = forwardRef<WheelHandle, { labels: string[]; size?: number; onCentrePress?: () => void; centreLabel?: string }>(
  function Wheel({ labels, size = 300, onCentrePress, centreLabel = "SPIN" }, ref) {
    const look = useLook();
    const reduced = useReducedMotion();
    const n = Math.max(labels.length, 1);
    const seg = 360 / n;
    const R = size / 2;
    // Three sizes; each name takes the biggest that fits its segment (fitLabel).
    const fontL = useFont(FIGTREE_BOLD, 14);
    const fontM = useFont(FIGTREE_BOLD, 12);
    const fontS = useFont(FIGTREE_BOLD, 10);
    const font = fontL && fontM && fontS ? fontL : null;
    const hubFont = useFont(FIGTREE_BOLD, 16);

    const angle = useSharedValue(0);
    const spinning = useRef(false);
    const resolver = useRef<((i: number) => void) | null>(null);
    const winner = useRef(-1);

    // The look's colours, round the wheel, with what reads on each.
    const palette = useMemo(() => {
      if (look.id === "kente")
        return [
          { bg: KENTE.gold, fg: KENTE.black },
          { bg: KENTE.green, fg: KENTE.cream },
          { bg: KENTE.red, fg: KENTE.cream },
          { bg: KENTE.cream, fg: KENTE.black },
        ];
      return [
        { bg: look.primary, fg: look.onPrimary },
        { bg: look.second, fg: look.onSecond },
        { bg: look.third, fg: look.onThird },
        { bg: look.colors.accent, fg: look.colors.textOnBrand },
      ];
    }, [look]);
    // Two of a kind should not touch: an odd last segment takes the next colour on.
    const colourOf = (i: number) => palette[(n % palette.length === 1 && i === n - 1 ? i + 1 : i) % palette.length];

    const segments = useMemo(() => {
      const rect = Skia.XYWHRect(4, 4, size - 8, size - 8);
      return labels.map((_, i) => {
        const p = Skia.Path.Make();
        p.moveTo(R, R);
        // Skia's 0 degrees is three o'clock; the pointer is at twelve.
        p.arcToOval(rect, -90 + i * seg, seg, false);
        p.close();
        return p;
      });
    }, [labels, size, R, seg]);

    const pointer = useMemo(() => {
      const p = Skia.Path.Make();
      p.moveTo(R - 13, 0);
      p.lineTo(R + 13, 0);
      p.lineTo(R, 26);
      p.close();
      return p;
    }, [R]);

    const transform = useDerivedValue(() => [{ rotate: (angle.value * Math.PI) / 180 }]);

    const tick = () => void Haptics.selectionAsync();
    useAnimatedReaction(
      () => Math.floor(angle.value / seg),
      (now, before) => {
        if (before !== null && now !== before) runOnJS(tick)();
      },
      [seg]
    );

    const finish = () => {
      spinning.current = false;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resolver.current?.(winner.current);
      resolver.current = null;
    };

    useImperativeHandle(
      ref,
      () => ({
        spin: () =>
          new Promise<number>((resolve) => {
            if (spinning.current || labels.length < 2) return resolve(-1);
            spinning.current = true;
            resolver.current = resolve;
            const w = Math.floor(Math.random() * labels.length);
            winner.current = w;
            // Land inside the winner, off its edges, then turn the wheel so it sits under the pointer.
            const mid = w * seg + seg / 2 + (Math.random() - 0.5) * seg * 0.6;
            const from = angle.value;
            const settle = (((360 - mid - (from % 360)) % 360) + 360) % 360;
            const to = from + (reduced ? 1 : 5 + Math.floor(Math.random() * 2)) * 360 + settle;
            angle.value = withTiming(to, { duration: reduced ? 900 : 4300 + Math.random() * 700, easing: Easing.out(Easing.cubic) }, (done) => {
              if (done) runOnJS(finish)();
            });
          }),
      }),
      [labels.length, reduced, seg]
    );

    const hub = R * 0.24;
    // Room along the radius, from just off the hub to just inside the rim.
    const room = R - hub - 22;
    // And across the segment where the name starts, which is the narrow end.
    const across = 2 * (hub + 10) * Math.sin(Math.min(Math.PI / 2, (seg * Math.PI) / 360)) - 4;
    const fitLabel = (label: string) => {
      for (const f of [fontL, fontM, fontS]) {
        if (!f) continue;
        if (f.getSize() > across) continue;
        if (f.measureText(label).width <= room) return { f, text: label };
      }
      const f = fontS ?? fontM ?? fontL!;
      let text = label;
      while (text.length > 1 && f.measureText(`${text}…`).width > room) text = text.slice(0, -1);
      return { f, text: `${text.trimEnd()}…` };
    };
    return (
      <View style={{ width: size, height: size + 18 }}>
        <Canvas style={{ width: size, height: size + 18 }}>
          <Group transform={[{ translateY: 14 }]}>
            {/* The rim, and a soft shadow ring under it. */}
            <Circle cx={R} cy={R} r={R} color={look.tileEdge} />
            <Group origin={vec(R, R)} transform={transform}>
              {segments.map((p, i) => (
                <Path key={`s${i}`} path={p} color={colourOf(i).bg} />
              ))}
              {font
                ? labels.map((label, i) => {
                    const { f, text } = fitLabel(label);
                    const w = f.measureText(text).width;
                    const mid = -90 + i * seg + seg / 2;
                    return (
                      <Group key={`l${i}`} origin={vec(R, R)} transform={[{ rotate: (mid * Math.PI) / 180 }]}>
                        {/* Along the radius, reading outwards from the hub, centred in the room. */}
                        <SkText x={R + hub + 10 + Math.max(0, (room - w) / 2)} y={R + f.getSize() * 0.36} text={text} font={f} color={colourOf(i).fg} />
                      </Group>
                    );
                  })
                : null}
            </Group>
            {/* Light across the top, so it reads as a thing rather than a chart. */}
            <Circle cx={R} cy={R} r={R - 4}>
              <RadialGradient c={vec(R * 0.7, R * 0.55)} r={R} colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]} />
            </Circle>
            <Circle cx={R} cy={R} r={hub + 5} color={look.colors.background} />
            <Circle cx={R} cy={R} r={hub} color={look.primary} />
            {hubFont ? (
              <SkText
                x={R - hubFont.measureText(centreLabel).width / 2}
                y={R + 6}
                text={centreLabel}
                font={hubFont}
                color={look.onPrimary}
              />
            ) : null}
          </Group>
          <Path path={pointer} color={look.colors.text} />
        </Canvas>
        {onCentrePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={centreLabel === "SPIN" ? "Spin the wheel" : centreLabel}
            onPress={onCentrePress}
            style={{ position: "absolute", top: 14 + R - hub, left: R - hub, width: hub * 2, height: hub * 2, borderRadius: hub }}
          />
        ) : null}
      </View>
    );
  }
);
