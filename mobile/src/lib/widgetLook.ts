import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_LOOK, LOOKS, isLookChoice, type Look, type LookChoice } from "./looks";
import type { WidgetPalette } from "../widgets/NextPlan";

/** One look as the widgets draw it: they cannot read looks.ts, so it travels in their props. */
export function paletteOf(l: Look): WidgetPalette {
  return {
    bg: l.colors.background,
    ink: l.colors.text,
    soft: l.colors.textSecondary,
    tile: l.tile,
    primary: l.primary,
    onPrimary: l.onPrimary,
    second: l.second,
    onSecond: l.onSecond,
    third: l.third,
    onThird: l.onThird,
    band: l.band,
  };
}

/**
 * The person's look for the widgets and the Live Activity, for the phone in
 * light and in dark: the same look twice, or Daylight and Night for "Follow
 * the sky", so the home screen turns over with the phone rather than waiting
 * for the app to open. Read from the same place the app keeps it.
 */
export async function widgetPalettes(): Promise<{ light: WidgetPalette; dark: WidgetPalette }> {
  let choice: LookChoice = DEFAULT_LOOK;
  try {
    const stored = await AsyncStorage.getItem("duro.look");
    if (isLookChoice(stored)) choice = stored;
  } catch {
    // The default look, which is what a new phone shows anyway.
  }
  if (choice === "sky") return { light: paletteOf(LOOKS.daylight), dark: paletteOf(LOOKS.night) };
  const p = paletteOf(LOOKS[choice]);
  return { light: p, dark: p };
}
