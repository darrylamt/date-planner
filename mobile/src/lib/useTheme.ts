import { useColorScheme } from "react-native";
import { Colors, type ThemeColors } from "../theme";

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

/** For the handful of places that need to branch on the scheme itself. */
export function useThemeWithScheme(): { colors: ThemeColors; scheme: ColorSchemeName } {
  const scheme = useColorSchemeName();
  return { colors: Colors[scheme], scheme };
}
