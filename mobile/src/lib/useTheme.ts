import { useColorScheme } from "react-native";
import { palettes, type Palette } from "../theme";

/**
 * Current semantic palette, following the phone's appearance setting.
 * `useColorScheme` returns null before the value is known — default to light
 * rather than flashing a dark frame on a light device.
 */
export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === "dark" ? palettes.dark : palettes.light;
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}
