import { Capsule, Circle, HStack, Rectangle, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  shapes,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

/**
 * One look's colours, as the widget draws them (the app's looks.ts). The
 * widget runtime has no access to the app's code, so they arrive here.
 */
export type WidgetPalette = {
  bg: string;
  ink: string;
  soft: string;
  tile: string;
  primary: string;
  onPrimary: string;
  second: string;
  onSecond: string;
  third: string;
  onThird: string;
  /** The woven kente strip along the top. */
  band: boolean;
};

/**
 * What the app hands the widget, already worded. The widget runs in its own
 * small runtime with no access to the app's code or constants, so every
 * string and colour it shows arrives here ready to draw.
 */
export type NextPlanProps = {
  /** True when there is no plan coming up: the widget offers to start one. */
  empty: boolean;
  /** Where a tap goes: the plan, or the planner. */
  url: string;
  title: string;
  /** "Tonight", "Tomorrow", "In 3 days", "Now". */
  countdown: string;
  /** "Sat 25 Oct". */
  when: string;
  firstTime: string;
  firstName: string;
  stops: { time: string; name: string }[];
  /**
   * The person's look, for the phone in light and in dark: the same look
   * twice, or Daylight and Night for "Follow the sky".
   */
  light: WidgetPalette;
  dark: WidgetPalette;
};

/**
 * "Your next plan", on the home screen and the lock screen, in the
 * redesign's looks (3 Nov 2026): the kente strip, the look's ground, the
 * countdown as a pill, and the stops numbered in the colours their pins wear
 * in the app. Small: the countdown, the plan's name and its first stop.
 * Medium: the same with up to three stops. Lock screen: one or three lines
 * in the system's tint. With nothing coming up, an invitation to plan.
 *
 * Everything inside this function runs in the widget's own runtime: only
 * Expo UI's SwiftUI components and modifiers, no module-scope values, no
 * hooks.
 */
const NextPlan = (props: NextPlanProps, env: WidgetEnvironment) => {
  "widget";
  const p = env.colorScheme === "dark" ? props.dark : props.light;
  const family = env.widgetFamily;
  const fills = [p.primary, p.second, p.third];
  const inks = [p.onPrimary, p.onSecond, p.onThird];

  /* ── the lock screen: the system tints it, so words only ── */
  if (family === "accessoryInline") {
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {props.empty ? "Plan your next night" : `${props.countdown} · ${props.firstName} ${props.firstTime}`}
      </Text>
    );
  }
  if (family === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), frame({ maxWidth: 1000, alignment: "leading" })]}>
        <Text modifiers={[font({ size: 14, weight: "heavy" }), lineLimit(1)]}>
          {props.empty ? "No plan yet" : `${props.countdown} · ${props.when}`}
        </Text>
        <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{props.empty ? "Plan your next night" : `${props.firstTime} ${props.firstName}`}</Text>
        {props.empty ? null : (
          <Text modifiers={[font({ size: 12 }), lineLimit(1), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>{props.title}</Text>
        )}
      </VStack>
    );
  }

  /* The kente strip, or a short bar in the look's colour. */
  const strip = p.band ? (
    <HStack spacing={0} modifiers={[frame({ maxWidth: 1000, height: 5 })]}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => (
        <Rectangle key={i} modifiers={[foregroundStyle([p.primary, p.second, p.primary, p.third][i % 4])]} />
      ))}
    </HStack>
  ) : (
    <HStack modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}>
      <Capsule modifiers={[foregroundStyle(p.primary), frame({ width: 26, height: 4 })]} />
      <Spacer />
    </HStack>
  );

  const pill = (
    <Text modifiers={[font({ size: 11, weight: "heavy" }), foregroundStyle(p.onPrimary), padding({ horizontal: 8, vertical: 3 }), background(p.primary, shapes.capsule())]}>
      {props.countdown.toUpperCase()}
    </Text>
  );

  const badge = (i: number, size: number) => (
    <ZStack modifiers={[frame({ width: size, height: size })]}>
      <Circle modifiers={[foregroundStyle(fills[i % 3])]} />
      <Text modifiers={[font({ size: size * 0.55, weight: "heavy" }), foregroundStyle(inks[i % 3])]}>{String(i + 1)}</Text>
    </ZStack>
  );

  /* ── nothing coming up ── */
  if (props.empty) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[containerBackground(p.bg, "widget"), widgetURL(props.url), frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}
      >
        {strip}
        <Spacer />
        {/* Durobot's orb: the look's three colours, one inside another. */}
        <ZStack modifiers={[frame({ width: 40, height: 40 })]}>
          <Circle modifiers={[foregroundStyle(p.second)]} />
          <Circle modifiers={[foregroundStyle(p.primary), frame({ width: 30, height: 30 })]} />
          <Circle modifiers={[foregroundStyle(p.third), frame({ width: 12, height: 12 }), padding({ bottom: 8, trailing: 8 })]} />
        </ZStack>
        <Text modifiers={[font({ size: 17, weight: "heavy" }), foregroundStyle(p.ink), lineLimit(2)]}>Plan your next night</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(p.soft), lineLimit(2)]}>Real places, real prices. Sorted in a minute.</Text>
      </VStack>
    );
  }

  /* ── the medium widget: the plan on the left, its stops on the right ── */
  if (family === "systemMedium") {
    return (
      <VStack alignment="leading" spacing={10} modifiers={[containerBackground(p.bg, "widget"), widgetURL(props.url)]}>
        {strip}
        <HStack spacing={14} alignment="top">
          <VStack alignment="leading" spacing={6} modifiers={[frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}>
            {pill}
            <Text modifiers={[font({ size: 18, weight: "heavy" }), foregroundStyle(p.ink), lineLimit(3)]}>{props.title}</Text>
            <Spacer />
            <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(p.soft)]}>{props.when}</Text>
          </VStack>
          <VStack
            alignment="leading"
            spacing={7}
            modifiers={[padding({ all: 10 }), background(p.tile, shapes.roundedRectangle({ cornerRadius: 16 })), frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}
          >
            {props.stops.map((s, i) => (
              <HStack key={i} spacing={7}>
                {badge(i, 18)}
                <VStack alignment="leading" spacing={0}>
                  <Text modifiers={[font({ size: 10, weight: "bold" }), foregroundStyle(p.soft)]}>{s.time}</Text>
                  <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(p.ink), lineLimit(1)]}>{s.name}</Text>
                </VStack>
              </HStack>
            ))}
          </VStack>
        </HStack>
      </VStack>
    );
  }

  /* ── the small widget ── */
  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[containerBackground(p.bg, "widget"), widgetURL(props.url), frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}
    >
      {strip}
      {pill}
      <Text modifiers={[font({ size: 15, weight: "heavy" }), foregroundStyle(p.ink), lineLimit(3)]}>{props.title}</Text>
      <Spacer />
      <HStack spacing={6}>
        {badge(0, 20)}
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[font({ size: 10, weight: "bold" }), foregroundStyle(p.soft)]}>{props.firstTime}</Text>
          <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(p.ink), lineLimit(1)]}>{props.firstName}</Text>
        </VStack>
      </HStack>
    </VStack>
  );
};

export default createWidget("NextPlan", NextPlan);
