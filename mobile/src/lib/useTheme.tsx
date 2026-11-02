import { createContext, type ReactNode } from "react";
import { useAppearance } from "./appearance";
import { OCCASION_HUES, OCCASION_HUES_DARK, type ThemeColors } from "../theme";
import type { Occasion } from "./types";

export type ColorSchemeName = "light" | "dark";

/**
 * The occasion currently being planned, or null outside a pathway.
 *
 * Held in context rather than passed down so that every existing useTheme()
 * call picks the theme up untouched, threading an occasion through forty
 * components would have been the same change made forty times.
 */
const OccasionContext = createContext<Occasion | null>(null);

export function OccasionThemeProvider({
  occasion,
  children,
}: {
  occasion: Occasion | null;
  children: ReactNode;
}) {
  return <OccasionContext.Provider value={occasion}>{children}</OccasionContext.Provider>;
}

export function useColorSchemeName(): ColorSchemeName {
  /*
   * Reads the in-app preference rather than the phone directly. When that
   * preference is "system" it still resolves to the phone, so the default
   * behaviour is unchanged and only an explicit choice diverges from it.
   */
  return useAppearance().scheme;
}

export function useTheme(): ThemeColors {
  /*
   * The look's colours, everywhere (looks.ts). An occasion no longer
   * recolours a pathway: in the redesign the look is the identity, and a
   * birthday planned in Kente stays Kente. OccasionThemeProvider remains so
   * older screens still compile; it changes nothing now.
   */
  return useAppearance().look.colors;
}

export function useIsDark(): boolean {
  return useColorSchemeName() === "dark";
}

/** The hue for one occasion, matched to the current scheme. */
export function useOccasionHue(id: string): { fg: string; bg: string } {
  const dark = useIsDark();
  const table = dark ? OCCASION_HUES_DARK : OCCASION_HUES;
  const colors = useAppearance().look.colors;
  return table[id] ?? { fg: colors.accent, bg: colors.accentSoft };
}

export function useThemeWithScheme(): { colors: ThemeColors; scheme: ColorSchemeName } {
  return { colors: useTheme(), scheme: useColorSchemeName() };
}
