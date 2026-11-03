import { useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useReducedMotion } from "../motion";

/**
 * A Blender animation played from one grid of frames (assets/3d/*-sheet.png):
 * the grid sits inside a window one frame wide and steps along it. Animated
 * PNGs did not play in expo-image on the phone (owner, 3 Nov 2026: "it
 * doesnt move"), and this plays anywhere. Still on its first frame under
 * Reduce Motion.
 */
export function Sprite({
  source,
  size,
  frames = 36,
  cols = 6,
  fps = 24,
}: {
  source: number;
  size: number;
  frames?: number;
  cols?: number;
  fps?: number;
}) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % frames), 1000 / fps);
    return () => clearInterval(t);
  }, [reduced, frames, fps]);
  const rows = Math.ceil(frames / cols);
  const x = (frame % cols) * size;
  const y = Math.floor(frame / cols) * size;
  return (
    <View style={{ width: size, height: size, overflow: "hidden" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image
        source={source}
        style={{ width: size * cols, height: size * rows, transform: [{ translateX: -x }, { translateY: -y }] }}
        contentFit="fill"
        cachePolicy="memory"
      />
    </View>
  );
}
