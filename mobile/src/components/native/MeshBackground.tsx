import { useEffect, useRef, type ComponentType } from "react";
import { Animated, Easing, Platform, StyleSheet, View, type ColorValue, type ViewStyle } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { nativeOptional } from "../../lib/nativeOptional";
import { useReducedMotion } from "../motion";

type MeshProps = {
  columns: number;
  rows: number;
  points: number[][];
  colors: ColorValue[];
  smoothsColors?: boolean;
  ignoresSafeArea?: boolean;
  style?: ViewStyle;
};

/*
 * SwiftUI's MeshGradient, from build 24 and iOS 18. The view is looked up
 * natively the moment expo-mesh-gradient is imported, so it is checked for
 * first; without it (or on iOS 17, where SwiftUI draws nothing) this renders
 * nothing, and the screen keeps the background it always had.
 */
const Mesh: ComponentType<MeshProps> | null =
  Platform.OS === "ios" && parseFloat(String(Platform.Version)) >= 18 && requireOptionalNativeModule("ExpoMeshGradient")
    ? nativeOptional(() => (require("expo-mesh-gradient") as { MeshGradientView: ComponentType<MeshProps> }).MeshGradientView)
    : null;

export const meshAvailable = (): boolean => Mesh != null;

/*
 * Three shapes of the same nine colours, the middle row and column pulled
 * a different way in each. Fading between them reads as colour moving
 * through the page, and costs three static views and an opacity on the
 * native driver, where moving the points themselves would mean sending
 * new arrays across the bridge thirty times a second.
 */
const SHAPES: number[][][] = [
  [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.3, 0.55], [1, 0.45], [0, 1], [0.5, 1], [1, 1]],
  [[0, 0], [0.5, 0], [1, 0], [0, 0.42], [0.7, 0.4], [1, 0.6], [0, 1], [0.5, 1], [1, 1]],
  [[0, 0], [0.5, 0], [1, 0], [0, 0.6], [0.5, 0.7], [1, 0.35], [0, 1], [0.5, 1], [1, 1]],
];

/**
 * A slowly moving wash of colour behind a screen or a card.
 *
 * `colors` is the 3 × 3 grid, top-left to bottom-right. Decoration only: the
 * native driver, never in the way of a touch, and still under Reduce Motion,
 * where it rests on the first shape.
 */
export function MeshBackground({ colors, style, period = 7000 }: { colors: ColorValue[]; style?: ViewStyle; period?: number }) {
  const reduced = useReducedMotion();
  const fades = useRef(SHAPES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;

  useEffect(() => {
    if (!Mesh || reduced) return;
    let i = 0;
    let live = true;
    const step = () => {
      if (!live) return;
      const next = (i + 1) % SHAPES.length;
      Animated.parallel([
        Animated.timing(fades[i], { toValue: 0, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(fades[next], { toValue: 1, duration: period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        i = next;
        step();
      });
    };
    step();
    return () => {
      live = false;
      fades.forEach((f) => f.stopAnimation());
    };
  }, [reduced, period, fades]);

  if (!Mesh || colors.length !== 9) return null;
  const M = Mesh;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {SHAPES.map((points, i) => (
        <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: fades[i] }]}>
          <M columns={3} rows={3} points={points} colors={colors} smoothsColors ignoresSafeArea={false} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ))}
    </View>
  );
}
