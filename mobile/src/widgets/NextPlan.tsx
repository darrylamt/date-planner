import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  aspectRatio,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  resizable,
  widgetAccentedRenderingMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

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
  /** The occasion's colour, for light and dark. */
  accent: string;
  accentDark: string;
  /**
   * The character in the occasion's costume, as a data: URI (see
   * scripts/widget-mascots.ts). Empty to draw none; a picture that will not
   * load draws nothing too, so it can never break the widget.
   */
  mascot: string;
};

/**
 * "Your next plan", on the home screen and the lock screen.
 *
 * Small: the countdown, the plan's name and its first stop. Medium: the same
 * with up to three stops and their times. Lock screen: one or three lines,
 * drawn in the system's tint. With nothing coming up, an invitation to plan.
 * The home screen sizes carry the character in the occasion's costume, the
 * one the app's cards wear; the lock screen, drawn in a single tint, does not.
 *
 * Everything inside this function runs in the widget's own runtime: only
 * Expo UI's SwiftUI components and modifiers, no module-scope values, no
 * hooks. That is why the colours below are written out here.
 */
const NextPlan = (props: NextPlanProps, env: WidgetEnvironment) => {
  "widget";
  const dark = env.colorScheme === "dark";
  const bg = dark ? "#0E1817" : "#FFFFFF";
  const ink = dark ? "#F2F7F6" : "#0C1413";
  const soft = dark ? "#9BABA8" : "#5F6E6C";
  const accent = dark ? props.accentDark || "#58A8A0" : props.accent || "#0F766E";
  const family = env.widgetFamily;

  /* ── the lock screen ── */
  if (family === "accessoryInline") {
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {props.empty ? "Plan your next outing" : `${props.countdown} · ${props.firstName} ${props.firstTime}`}
      </Text>
    );
  }
  if (family === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), frame({ maxWidth: 1000, alignment: "leading" })]}>
        <Text modifiers={[font({ size: 14, weight: "bold" }), lineLimit(1)]}>
          {props.empty ? "No plan yet" : `${props.countdown} · ${props.when}`}
        </Text>
        <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>
          {props.empty ? "Plan your next outing" : `${props.firstTime} ${props.firstName}`}
        </Text>
        {props.empty ? null : (
          <Text modifiers={[font({ size: 12 }), lineLimit(1), foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
            {props.title}
          </Text>
        )}
      </VStack>
    );
  }

  /* ── nothing coming up ── */
  if (props.empty) {
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[containerBackground(bg, "widget"), widgetURL(props.url), frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}
      >
        {props.mascot ? (
          <Image
            uiImage={props.mascot}
            modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: 52, height: 52 }), widgetAccentedRenderingMode("desaturated")]}
          />
        ) : (
          <Image systemName="sparkles" size={22} color={accent} />
        )}
        <Spacer />
        <Text modifiers={[font({ size: 16, weight: "bold" }), foregroundStyle(ink), lineLimit(2)]}>Plan your next outing</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(soft), lineLimit(2)]}>
          Dates, birthdays and days out, sorted in a minute.
        </Text>
      </VStack>
    );
  }

  /* ── the medium widget: the plan on the left, its stops on the right ── */
  if (family === "systemMedium") {
    return (
      <HStack spacing={14} alignment="top" modifiers={[containerBackground(bg, "widget"), widgetURL(props.url)]}>
        <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}>
          <HStack spacing={4}>
            <Image systemName="calendar" size={12} color={accent} />
            <Text modifiers={[font({ size: 12, weight: "heavy" }), foregroundStyle(accent)]}>{props.countdown.toUpperCase()}</Text>
          </HStack>
          <Text modifiers={[font({ size: 17, weight: "bold" }), foregroundStyle(ink), lineLimit(3)]}>{props.title}</Text>
          <Spacer />
          <HStack alignment="bottom" modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}>
            <Text modifiers={[font({ size: 12, weight: "medium" }), foregroundStyle(soft)]}>{props.when}</Text>
            <Spacer />
            {props.mascot ? (
              <Image
                uiImage={props.mascot}
                modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: 50, height: 50 }), widgetAccentedRenderingMode("desaturated")]}
              />
            ) : null}
          </HStack>
        </VStack>
        <VStack alignment="leading" spacing={8} modifiers={[frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}>
          {props.stops.map((s, i) => (
            <VStack key={i} alignment="leading" spacing={1}>
              <Text modifiers={[font({ size: 11, weight: "bold" }), foregroundStyle(accent)]}>{s.time}</Text>
              <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(ink), lineLimit(1)]}>{s.name}</Text>
            </VStack>
          ))}
        </VStack>
      </HStack>
    );
  }

  /* ── the small widget ── */
  return (
    <VStack
      alignment="leading"
      spacing={3}
      modifiers={[containerBackground(bg, "widget"), widgetURL(props.url), frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" })]}
    >
      <HStack spacing={4}>
        <Image systemName="calendar" size={12} color={accent} />
        <Text modifiers={[font({ size: 12, weight: "heavy" }), foregroundStyle(accent)]}>{props.countdown.toUpperCase()}</Text>
      </HStack>
      <Text modifiers={[font({ size: 15, weight: "bold" }), foregroundStyle(ink), lineLimit(3)]}>{props.title}</Text>
      <Spacer />
      <HStack alignment="bottom" spacing={4} modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 11, weight: "bold" }), foregroundStyle(accent)]}>{props.firstTime}</Text>
          <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(ink), lineLimit(1)]}>{props.firstName}</Text>
        </VStack>
        <Spacer />
        {props.mascot ? (
          <Image
            uiImage={props.mascot}
            modifiers={[resizable(), aspectRatio({ contentMode: "fit" }), frame({ width: 42, height: 42 }), widgetAccentedRenderingMode("desaturated")]}
          />
        ) : null}
      </HStack>
    </VStack>
  );
};

export default createWidget("NextPlan", NextPlan);
