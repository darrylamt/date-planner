import { Platform, View, type ColorValue } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useTheme } from "../lib/useTheme";

export interface SymbolProps {
  /** SF Symbol name, e.g. "chevron.right", "checkmark.circle.fill". */
  name: SymbolViewProps["name"];
  size?: number;
  /** Accepts ColorValue so navigator-supplied tint colours pass straight through. */
  color?: ColorValue;
  weight?: SymbolViewProps["weight"];
}

/**
 * SF Symbol. iOS renders the real symbol; other platforms get a same-sized
 * spacer so layout never shifts between platforms.
 */
export function Symbol({ name, size = 17, color, weight = "regular" }: SymbolProps) {
  const c = useTheme();
  if (Platform.OS !== "ios") {
    return <View style={{ width: size, height: size }} />;
  }
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={(color ?? c.tint) as string}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
    />
  );
}
