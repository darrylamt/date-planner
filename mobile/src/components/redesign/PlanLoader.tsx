import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Symbol } from "../Symbol";
import { useLook } from "../../lib/appearance";
import { DurobotOrb } from "./DurobotOrb";
import { Body } from "../look";

/**
 * A value that goes 0 → 1 forever, in `ms`. A status indicator, so it turns
 * under Reduce Motion too, as the system's own does: Reanimated would
 * otherwise skip straight to the end and leave the ring still.
 */
function useTurn(ms: number) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = 0;
    v.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false, undefined, ReduceMotion.Never);
  }, [ms, v]);
  return v;
}

/**
 * The plan is being built: three arcs in the look's colours turning round
 * Durobot's orb, which quickens while it thinks, and a dotted ring turning
 * the other way. Drawn with SVG and Reanimated, like the orb, which plays on
 * the phone (the Blender ring sheet did not show there, owner 3 Nov 2026).
 */
export function PlanLoader({ size = 176 }: { size?: number }) {
  const look = useLook();
  const outer = useTurn(1500);
  const inner = useTurn(4200);
  const outerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${outer.value * 360}deg` }] }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-inner.value * 360}deg` }] }));

  const stroke = Math.max(6, Math.round(size * 0.05));
  const r = size / 2 - stroke;
  const around = 2 * Math.PI * r;
  const arc = around * 0.22;
  const colours = [look.primary, look.second, look.third];
  const ri = r - stroke * 2.2;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityRole="progressbar" accessibilityLabel="Building your plan">
      <Animated.View style={[{ position: "absolute", width: size, height: size }, outerStyle]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={look.tileEdge} strokeWidth={stroke} fill="none" />
          {colours.map((c, i) => (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={c}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${arc} ${around - arc}`}
              strokeDashoffset={-(around / 3) * i}
            />
          ))}
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: "absolute", width: size, height: size }, innerStyle]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={ri} stroke={look.colors.textSecondary} strokeOpacity={0.5} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 9" fill="none" />
        </Svg>
      </Animated.View>
      <DurobotOrb size={Math.round(size * 0.42)} thinking />
    </View>
  );
}

/** A small turning arc: the step being worked on. */
function StepSpinner({ size = 22 }: { size?: number }) {
  const look = useLook();
  const turn = useTurn(900);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const r = size / 2 - 2;
  const around = 2 * Math.PI * r;
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={look.tileEdge} strokeWidth={3} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={look.primary} strokeWidth={3} strokeLinecap="round" fill="none" strokeDasharray={`${around * 0.3} ${around}`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * What the planner is doing, ticked off one by one. Each step takes its turn
 * for `stepMs`; the last one keeps turning until the plan arrives, so the list
 * never claims to be finished before it is.
 */
export function BuildSteps({ steps, stepMs = 1800 }: { steps: string[]; stepMs?: number }) {
  const look = useLook();
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (at >= steps.length - 1) return;
    const t = setTimeout(() => setAt((i) => i + 1), stepMs);
    return () => clearTimeout(t);
  }, [at, steps.length, stepMs]);

  return (
    <View style={{ gap: 14 }}>
      {steps.map((s, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
              {done ? (
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: look.second, alignItems: "center", justifyContent: "center" }}>
                  <Symbol name="checkmark" size={12} weight="bold" color={look.onSecond} />
                </View>
              ) : now ? (
                <StepSpinner />
              ) : (
                <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: look.tileEdge }} />
              )}
            </View>
            <Body size={16} weight={now ? "600" : "400"} tone={done ? "secondary" : now ? "primary" : "tertiary"} style={{ flex: 1 }}>
              {s}
            </Body>
          </View>
        );
      })}
    </View>
  );
}
