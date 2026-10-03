import { HStack, Image, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

/**
 * What the app hands the Live Activity, already worded (see liveActivity.ts).
 *
 * ActivityKit caps an activity's content at 4 KB, so there is no mascot here
 * as there is on the widget, and names arrive trimmed.
 */
export type PlanTonightProps = {
  title: string;
  accent: string;
  accentDark: string;
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
};

/**
 * Tonight's plan, on the Lock Screen and in the Dynamic Island.
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
  const dark = env.colorScheme === "dark";
  const accent = dark ? props.accentDark || "#58A8A0" : props.accent || "#0F766E";
  const ink = dark ? "#F2F7F6" : "#0C1413";
  const soft = dark ? "#9BABA8" : "#5F6E6C";
  const span = { lower: new Date(props.from), upper: new Date(Math.max(props.from, props.to)) };

  const timer = (size: number) => (
    <Text
      timerInterval={span}
      countsDown
      modifiers={[font({ size, weight: "bold", design: "rounded" }), monospacedDigit(), foregroundStyle(ink), multilineTextAlignment("trailing"), frame({ maxWidth: size * 4, alignment: "trailing" })]}
    />
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 14 }), activityBackgroundTint(dark ? "#0E1817" : "#FFFFFF")]}>
        <HStack alignment="top" spacing={10}>
          <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}>
            <Text modifiers={[font({ size: 11, weight: "heavy" }), foregroundStyle(accent), lineLimit(1)]}>{props.eyebrow}</Text>
            <Text modifiers={[font({ size: 18, weight: "bold" }), foregroundStyle(ink), lineLimit(1)]}>{props.name}</Text>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(soft), lineLimit(1)]}>{props.line}</Text>
          </VStack>
          {timer(26)}
        </HStack>
        <ProgressView timerInterval={span} countsDown={false} modifiers={[tint(accent)]} />
        <HStack spacing={8}>
          {props.schedule.map((s, i) => (
            <VStack key={i} alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}>
              <Text modifiers={[font({ size: 10, weight: "bold" }), foregroundStyle(i === props.current ? accent : soft), monospacedDigit()]}>{s.time}</Text>
              <Text modifiers={[font({ size: 11, weight: i === props.current ? "bold" : "regular" }), foregroundStyle(i === props.current ? ink : soft), lineLimit(1)]}>
                {s.name}
              </Text>
            </VStack>
          ))}
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName="mappin.and.ellipse" color={accent} />,
    compactTrailing: (
      <Text
        timerInterval={span}
        countsDown
        modifiers={[font({ size: 14, weight: "semibold" }), monospacedDigit(), foregroundStyle(accent), frame({ maxWidth: 56, alignment: "trailing" })]}
      />
    ),
    minimal: <Image systemName="mappin.and.ellipse" color={accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 4 })]}>
        <Image systemName="mappin.and.ellipse" color={accent} />
        <Text modifiers={[font({ size: 10, weight: "heavy" }), foregroundStyle(accent), lineLimit(1)]}>{props.eyebrow.split(" · ")[0]}</Text>
      </VStack>
    ),
    expandedCenter: (
      <Text modifiers={[font({ size: 16, weight: "bold" }), foregroundStyle("#FFFFFF"), lineLimit(1)]}>{props.name}</Text>
    ),
    expandedTrailing: timer(20),
    expandedBottom: (
      <VStack alignment="leading" spacing={6}>
        <HStack>
          <Text modifiers={[font({ size: 13 }), foregroundStyle("#C7D2D0"), lineLimit(1)]}>{props.line}</Text>
          <Spacer />
        </HStack>
        <ProgressView timerInterval={span} countsDown={false} modifiers={[tint(accent)]} />
      </VStack>
    ),
  };
};

export default createLiveActivity<PlanTonightProps>("PlanTonight", PlanTonight);
