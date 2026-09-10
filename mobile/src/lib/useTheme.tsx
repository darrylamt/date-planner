import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
  Colors,
  OCCASION_HUES,
  OCCASION_HUES_DARK,
  type ThemeColors,
} from "../theme";
import { OCCASION_THEME } from "./planConstants";
import type { Occasion } from "./types";

export type ColorSchemeName = "light" | "dark";

/**
 * The occasion currently being planned, or null outside a pathway.
 *
 * Held in context rather than passed down so that every existing useTheme()
 * call picks the theme up untouched — threading an occasion through forty
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
  // Null before the value is known — default to light rather than flashing a
  // dark frame on a light device.
  return useColorScheme() === "dark" ? "dark" : "light";
}

export function useTheme(): ThemeColors {
  const scheme = useColorSchemeName();
  const occasion = useContext(OccasionContext);
  const base = Colors[scheme];

  if (!occasion) return base;

  const theme = OCCASION_THEME[occasion];
  if (!theme) return base;

  const dark = scheme === "dark";
  const accent = dark ? theme.accentDark : theme.accent;

  // Only the accent family and the page tint move. Text, borders and status
  // colours stay put: an occasion should recolour the app, not restate what
  // red and green mean.
  return {
    ...base,
    background: dark ? theme.pageDark : theme.page,
    brand: accent,
    accent,
    accentSoft: mixHex(accent, dark ? "#000000" : "#FFFFFF", dark ? 0.82 : 0.9),
    accentBorder: mixHex(accent, dark ? "#000000" : "#FFFFFF", dark ? 0.66 : 0.74),
  };
}

export function useIsDark(): boolean {
  return useColorSchemeName() === "dark";
}

/** The hue for one occasion, matched to the current scheme. */
export function useOccasionHue(id: string): { fg: string; bg: string } {
  const dark = useIsDark();
  const table = dark ? OCCASION_HUES_DARK : OCCASION_HUES;
  const colors = Colors[dark ? "dark" : "light"];
  return table[id] ?? { fg: colors.accent, bg: colors.accentSoft };
}

export function useThemeWithScheme(): { colors: ThemeColors; scheme: ColorSchemeName } {
  return { colors: useTheme(), scheme: useColorSchemeName() };
}

/** Local copy of the theme's blend, so this module has no circular import. */
function mixHex(hex: string, target: string, amount: number): string {
  const ch = (h: string) => {
    const v = h.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(v.substr(i, 2), 16));
  };
  const [r1, g1, b1] = ch(hex);
  const [r2, g2, b2] = ch(target);
  const blend = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `#${[blend(r1, r2), blend(g1, g2), blend(b1, b2)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}
