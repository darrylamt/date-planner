import { StyleSheet, useWindowDimensions } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { Canvas, Fill, Shader, Skia, useClock, vec } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { useReducedMotion } from "../motion";

/*
 * The Night look's sky, alive (redesign, 2 Nov 2026): dusk at the top into
 * night below, the last of the sun low and drifting, and a few stars that
 * twinkle. A Skia shader, so it is the GPU's work and costs the screen
 * nothing. Still under Reduce Motion. NightSky.web.tsx is the plain gradient.
 */
const SKY = Skia.RuntimeEffect.Make(`
uniform float2 res;
uniform float time;

half4 main(float2 xy) {
  float2 uv = xy / res;
  float3 top = float3(0.18, 0.11, 0.32);
  float3 mid = float3(0.10, 0.07, 0.21);
  float3 bot = float3(0.03, 0.03, 0.055);
  float3 col = mix(top, mid, smoothstep(0.0, 0.34, uv.y));
  col = mix(col, bot, smoothstep(0.34, 0.72, uv.y));

  float2 sun = float2(0.5 + 0.08 * sin(time * 0.05), 0.40);
  float d = distance(float2(uv.x, uv.y * 1.7), float2(sun.x, sun.y * 1.7));
  col += float3(1.0, 0.59, 0.31) * 0.24 * (1.0 - smoothstep(0.0, 0.55, d));

  float2 cell = floor(xy / 28.0);
  float h = fract(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
  if (h > 0.982 && uv.y < 0.55) {
    float2 c = (cell + 0.5) * 28.0;
    float s = 1.0 - smoothstep(0.0, 1.8, distance(xy, c));
    float tw = 0.55 + 0.45 * sin(time * 1.4 + h * 40.0);
    col += float3(1.0) * s * tw * 0.85;
  }
  return half4(half3(col), 1.0);
}
`);

export function NightSky() {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const clock = useClock();
  const uniforms = useDerivedValue(() => ({ res: vec(width, height), time: reduced ? 0 : clock.value / 1000 }));

  // A shader that would not compile falls back to the gradient rather than an empty screen.
  if (!SKY) {
    return (
      <LinearGradient colors={["#2E1D52", "#1B1336", "#0C0A16", "#08070E"]} locations={[0, 0.34, 0.64, 1]} style={StyleSheet.absoluteFill} />
    );
  }
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={SKY} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
