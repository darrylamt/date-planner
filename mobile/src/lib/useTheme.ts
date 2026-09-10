import { useColorScheme } from "react-native";
import {
  Colors,
  OCCASION_HUES,
  OCCASION_HUES_DARK,
  type ThemeColors,
} from "../theme";

export type ColorSchemeName = "light" | "dark";

export function useColorSchemeName(): ColorSchemeName {
  // Null before the value is known — default to light rather than flashing a
  // dark frame on a light device.
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useTheme(): ThemeColors {
  return Colors[useColorSchemeName()];
}

export function useIsDark(): boolean {
  return useColorSchemeName() === "dark";
}

/**
 * The hue for one occasion, matched to the current scheme. Falls back to the
 * accent so a newly added occasion is never invisible for want of a swatch.
 */
export function useOccasionHue(id: string): { fg: string; bg: string } {
  const dark = useIsDark();
  const table = dark ? OCCASION_HUES_DARK : OCCASION_HUES;
  const colors = Colors[dark ? "dark" : "light"];
  return table[id] ?? { fg: colors.accent, bg: colors.accentSoft };
}

/** For the handful of places that need to branch on the scheme itself. */
export function useThemeWithScheme(): { colors: ThemeColors; scheme: ColorSchemeName } {
  const scheme = useColorSchemeName();
  return { colors: Colors[scheme], scheme };
}
