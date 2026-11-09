import { Circle, HStack, ProgressView, Rectangle, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  background,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  shapes,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import type { WidgetPalette } from "./NextPlan";

/**
 * What the app hands the Live Activity, already worded (see liveActivity.ts).
 *
 * ActivityKit caps an activity's content at 4 KB, so names arrive trimmed
 * and the schedule is four stops at most.
 */
export type PlanTonightProps = {
  title: string;
  /** "FIRST UP · 6:30 PM", "NEXT · ARRIVE 8:30 PM", "NOW". */
  eyebrow: string;
  /** The stop this moment is about. */
  name: string;
  /** "then Pit Stop at 9:00 PM", "Leave at 8:15 PM for Pit Stop", "Last stop, until 11:30 PM". */
  line: string;
  /** The countdown, from and to, in ms since 1970. */
  from: number;
  to: number;
  /** The night, every stop: true whenever it is looked at, updated or not. */
  schedule: { time: string; name: string }[];
  /** Which of them the moment is about. */
  current: number;
  /** The person's look, for the phone in light and in dark (NextPlan's palettes). */
  light: WidgetPalette;
  dark: WidgetPalette;
};

/**
 * Tonight's plan, on the Lock Screen and in the Dynamic Island, in the
 * redesign's looks (3 Nov 2026): the kente strip, the moment as a pill, the
 * countdown large in the look's colour, and the night's stops numbered in
 * their pin colours, the current one lit.
 *
 * An activity cannot change itself: without a server pushing to it, it only
 * moves when the app runs. So it is built to stay true between updates. The
 * night's whole schedule is always there and always right; the countdown runs
 * on its own to the next moment (arriving, or time to leave); and the app
 * brings it forward whenever it is opened. When a moment passes with the app
 * closed, the countdown rests at zero and iOS dims the activity as stale,
 * which is the honest look for "this was true at 8".
 *
 * Runs in the widget's own runtime: Expo UI only, nothing from module scope.
 */
const PlanTonight = (props: PlanTonightProps, env: LiveActivityEnvironment) => {
  "widget";
  const p = env.colorScheme === "dark" ? props.dark : props.light;
  const fills = [p.primary, p.second, p.third];
  const inks = [p.onPrimary, p.onSecond, p.onThird];
  const span = { lower: new Date(props.from), upper: new Date(Math.max(props.from, props.to)) };
  // The Dynamic Island is always black, whatever the look.
  const islandAccent = p.primary;

  const timer = (size: number, color: string) => (
    <Text
      timerInterval={span}
      countsDown
      modifiers={[font({ size, weight: "heavy", design: "rounded" }), monospacedDigit(), foregroundStyle(color), multilineTextAlignment("trailing"), frame({ maxWidth: size * 4, alignment: "trailing" })]}
    />
  );

  const badge = (i: number, size: number, lit: boolean) => (
    <ZStack modifiers={[frame({ width: size, height: size })]}>
      <Circle modifiers={[foregroundStyle(lit ? fills[i % 3] : p.tile)]} />
      <Text modifiers={[font({ size: size * 0.55, weight: "heavy" }), foregroundStyle(lit ? inks[i % 3] : p.soft)]}>{String(i + 1)}</Text>
    </ZStack>
  );

  const strip = p.band ? (
    <HStack spacing={0} modifiers={[frame({ maxWidth: 1000, height: 4 })]}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((i) => (
        <Rectangle key={i} modifiers={[foregroundStyle([p.primary, p.second, p.primary, p.third][i % 4])]} />
      ))}
    </HStack>
  ) : null;

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 14 }), activityBackgroundTint(p.bg)]}>
        {strip}
        <HStack alignment="top" spacing={10}>
          <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}>
            <Text modifiers={[font({ size: 10, weight: "heavy" }), foregroundStyle(p.onPrimary), padding({ horizontal: 7, vertical: 2 }), background(p.primary, shapes.capsule()), lineLimit(1)]}>
              {props.eyebrow}
            </Text>
            <Text modifiers={[font({ size: 19, weight: "heavy" }), foregroundStyle(p.ink), lineLimit(1)]}>{props.name}</Text>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(p.soft), lineLimit(1)]}>{props.line}</Text>
          </VStack>
          {timer(28, p.primary)}
        </HStack>
        <ProgressView timerInterval={span} countsDown={false} modifiers={[tint(p.primary)]} />
        <HStack spacing={8}>
          {props.schedule.map((s, i) => (
            <HStack key={i} spacing={5} modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}>
              {badge(i, 16, i === props.current)}
              <VStack alignment="leading" spacing={0}>
                <Text modifiers={[font({ size: 9, weight: "bold" }), foregroundStyle(p.soft), monospacedDigit()]}>{s.time}</Text>
                <Text modifiers={[font({ size: 11, weight: i === props.current ? "bold" : "regular" }), foregroundStyle(i === props.current ? p.ink : p.soft), lineLimit(1)]}>
                  {s.name}
                </Text>
              </VStack>
            </HStack>
          ))}
        </HStack>
      </VStack>
    ),
    compactLeading: (
      <ZStack modifiers={[frame({ width: 20, height: 20 })]}>
        <Circle modifiers={[foregroundStyle(islandAccent)]} />
        <Text modifiers={[font({ size: 11, weight: "heavy" }), foregroundStyle(p.onPrimary)]}>{String(props.current + 1)}</Text>
      </ZStack>
    ),
    compactTrailing: (
      <Text
        timerInterval={span}
        countsDown
        modifiers={[font({ size: 14, weight: "bold", design: "rounded" }), monospacedDigit(), foregroundStyle(islandAccent), frame({ maxWidth: 56, alignment: "trailing" })]}
      />
    ),
    minimal: (
      <ZStack modifiers={[frame({ width: 20, height: 20 })]}>
        <Circle modifiers={[foregroundStyle(islandAccent)]} />
        <Text modifiers={[font({ size: 11, weight: "heavy" }), foregroundStyle(p.onPrimary)]}>{String(props.current + 1)}</Text>
      </ZStack>
    ),
    expandedLeading: (
      <VStack alignment="leading" spacing={3} modifiers={[padding({ leading: 4 })]}>
        <ZStack modifiers={[frame({ width: 26, height: 26 })]}>
          <Circle modifiers={[foregroundStyle(islandAccent)]} />
          <Text modifiers={[font({ size: 13, weight: "heavy" }), foregroundStyle(p.onPrimary)]}>{String(props.current + 1)}</Text>
        </ZStack>
        <Text modifiers={[font({ size: 10, weight: "heavy" }), foregroundStyle(islandAccent), lineLimit(1)]}>{props.eyebrow.split(" · ")[0]}</Text>
      </VStack>
    ),
    expandedCenter: <Text modifiers={[font({ size: 16, weight: "heavy" }), foregroundStyle("#FFFFFF"), lineLimit(1)]}>{props.name}</Text>,
    expandedTrailing: timer(22, islandAccent),
    expandedBottom: (
      <VStack alignment="leading" spacing={6}>
        <HStack>
          <Text modifiers={[font({ size: 13 }), foregroundStyle("#C9C2B4"), lineLimit(1)]}>{props.line}</Text>
          <Spacer />
        </HStack>
        <ProgressView timerInterval={span} countsDown={false} modifiers={[tint(islandAccent)]} />
      </VStack>
    ),
  };
};

export default createLiveActivity<PlanTonightProps>("PlanTonight", PlanTonight);
