import { useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Easing, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { Canvas, Picture, Skia } from "@shopify/react-native-skia";
import { useLook } from "../../lib/appearance";
import { KENTE } from "../../lib/looks";
import { useReducedMotion } from "../motion";

/**
 * Confetti in the look's colours, for a plan saved (redesign, 2 Nov 2026).
 * Drawn as one Skia picture a frame, on the UI thread, so seventy pieces cost
 * nothing to the screen under them. Bump `fire` to throw a handful.
 */
export function Confetti({ fire }: { fire: number }) {
  const look = useLook();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(1);

  const colours = useMemo(
    () => (look.id === "kente" ? [KENTE.gold, KENTE.green, KENTE.red, KENTE.cream] : [look.primary, look.second, look.colors.accent, look.third]),
    [look]
  );
  const parts = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: Math.random() * width,
        vx: (Math.random() - 0.5) * 160,
        vy: 160 + Math.random() * 320,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 720,
        w: 6 + Math.random() * 6,
        h: 10 + Math.random() * 8,
        c: i % 4,
        delay: Math.random() * 0.3,
      })),
    // A new handful each time it is fired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire, width]
  );

  useEffect(() => {
    if (!fire || reduced) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 2600, easing: Easing.linear });
  }, [fire, reduced, t]);

  const picture = useDerivedValue(() => {
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, width, height));
    if (t.value < 1) {
      const paint = Skia.Paint();
      const secs = t.value * 2.6;
      const fade = t.value > 0.75 ? (1 - t.value) / 0.25 : 1;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const s = Math.max(0, secs - p.delay);
        const x = p.x + p.vx * s;
        const y = -20 + p.vy * s + 140 * s * s;
        paint.setColor(Skia.Color(colours[p.c]));
        paint.setAlphaf(fade);
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(p.rot + p.vr * s, 0, 0);
        canvas.drawRect(Skia.XYWHRect(-p.w / 2, -p.h / 2, p.w, p.h), paint);
        canvas.restore();
      }
    }
    return rec.finishRecordingAsPicture();
  });

  if (reduced) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}
