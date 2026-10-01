import type { ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useIsDark, useTheme } from "../lib/useTheme";

/*
 * Apple's Liquid Glass where the phone has it, a frosted stand-in where not.
 *
 * expo-glass-effect arrived after the binaries already on phones were built,
 * so it is looked for before it is touched: its views register their native
 * half on import, and a build without it would draw an "unimplemented
 * component" box. With the module present and iOS 26 underneath, the real
 * material is used; anywhere else, a blur with a sheen and an edge highlight.
 */
type GlassViewType = React.ComponentType<{
  style?: StyleProp<ViewStyle>;
  glassEffectStyle?: "regular" | "clear";
  tintColor?: string;
  isInteractive?: boolean;
  children?: ReactNode;
}>;

let NativeGlass: GlassViewType | null = null;
if (Platform.OS === "ios" && requireOptionalNativeModule("ExpoGlassEffect")) {
  try {
    const glass = require("expo-glass-effect") as { GlassView: GlassViewType; isLiquidGlassAvailable: () => boolean };
    if (glass.isLiquidGlassAvailable()) NativeGlass = glass.GlassView;
  } catch {
    NativeGlass = null;
  }
}

/** Whether this phone is drawing Apple's own Liquid Glass. */
export const liquidGlass = NativeGlass !== null;

export function Glass({
  children,
  style,
  tint,
  interactive = false,
  onLayout,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** A colour to stain the glass with, for a control that should read as coloured glass. */
  tint?: string;
  interactive?: boolean;
  onLayout?: (e: { nativeEvent: { layout: { width: number; height: number } } }) => void;
}) {
  const c = useTheme();
  const dark = useIsDark();

  if (NativeGlass) {
    return (
      <View style={style} onLayout={onLayout}>
        <NativeGlass
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999 }}
          glassEffectStyle="regular"
          tintColor={tint}
          isInteractive={interactive}
        />
        {children}
      </View>
    );
  }

  return (
    <View style={[style, { overflow: "hidden" }]} onLayout={onLayout}>
      <BlurView
        intensity={Platform.OS === "ios" ? 55 : 0}
        tint={dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* The body of the glass: a wash of the tint, or of the page. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: tint ?? c.glass,
          opacity: tint ? 0.92 : 1,
        }}
      />
      {/* The sheen: light caught in the top half, as curved glass does. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "52%",
          backgroundColor: "#FFFFFF",
          opacity: dark ? 0.05 : tint ? 0.16 : 0.22,
        }}
      />
      {/* The rim: a bright hairline along the top edge and a soft one all round. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.75)",
          borderBottomColor: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
        }}
      />
      {children}
    </View>
  );
}
