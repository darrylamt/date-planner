import { Platform, View, type ColorValue } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import regular from "expo-symbols/androidWeights/regular";
import medium from "expo-symbols/androidWeights/medium";
import semiBold from "expo-symbols/androidWeights/semiBold";
import bold from "expo-symbols/androidWeights/bold";
import { useTheme } from "../lib/useTheme";
import { FALLBACK, MATERIAL } from "../lib/materialSymbols";

type SFWeight = Exclude<SymbolViewProps["weight"], object | undefined>;

export interface SymbolProps {
  /** SF Symbol name, e.g. "chevron.right", "checkmark.circle.fill". */
  name: SymbolViewProps["name"];
  size?: number;
  /** Accepts ColorValue so navigator-supplied tint colours pass straight through. */
  color?: ColorValue;
  weight?: SFWeight;
}

/** The Material Symbols font closest to each SF weight the app asks for. */
const ANDROID_WEIGHT = (w: SFWeight) =>
  w === "bold" || w === "heavy" || w === "black"
    ? bold
    : w === "semibold"
      ? semiBold
      : w === "medium"
        ? medium
        : regular;

/**
 * SF Symbol on iOS, and its Material Symbol twin on Android (the map in
 * materialSymbols.ts). Anywhere else, a same-sized spacer so layout never
 * shifts between platforms.
 */
export function Symbol({ name, size = 17, color, weight = "regular" }: SymbolProps) {
  const c = useTheme();
  const tint = (color ?? c.accent) as string;
  if (Platform.OS === "android") {
    return (
      <SymbolView
        name={typeof name === "string" ? { android: MATERIAL[name] ?? FALLBACK } : name}
        size={size}
        tintColor={tint}
        weight={{ ios: weight, android: ANDROID_WEIGHT(weight) }}
        style={{ width: size, height: size }}
      />
    );
  }
  if (Platform.OS !== "ios") {
    return <View style={{ width: size, height: size }} />;
  }
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={tint}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
    />
  );
}
