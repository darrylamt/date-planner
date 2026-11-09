import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fontFamilyFor, type as typeScale } from "../theme";
import { useTheme } from "../lib/useTheme";
import { useLook } from "../lib/appearance";

/** The sizes that are titles: set in the look's display face (looks.ts), everything else in Figtree. */
const DISPLAY = new Set<string>(["display", "largeTitle", "displaySmall", "title1", "title2", "title3"]);

type Variant = keyof typeof typeScale;
type Tone = "label" | "secondary" | "tertiary" | "quaternary" | "tint" | "onTint" | "red" | "green" | "orange";

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: TextStyle["fontWeight"];
  /** Tabular figures, use for prices, times and any column of numbers. */
  tabular?: boolean;
  center?: boolean;
  uppercase?: boolean;
}

/**
 * Themed text. One sans face throughout, stated explicitly rather than left to
 * the platform default, so nothing can quietly fall back to a serif. On iOS
 * this resolves to SF Pro, which keeps Dynamic Type and the native look.
 */
export function Text({
  variant = "body",
  tone = "label",
  weight,
  tabular,
  center,
  uppercase,
  style, ...rest
}: AppTextProps) {
  const c = useTheme();
  const look = useLook();
  const base = typeScale[variant];
  const title = DISPLAY.has(variant);

  const color =
    tone === "label"
      ? c.text
      : tone === "secondary"
        ? c.textSecondary
        : tone === "tertiary"
          ? c.textTertiary
          : tone === "quaternary"
            ? c.textTertiary
            : tone === "tint"
              ? c.accent
              : tone === "onTint"
                ? c.textOnBrand
                : tone === "red"
                  ? c.danger
                  : tone === "green"
                    ? c.success
                    : c.warning;

  // The family carries the weight; fontWeight alone cannot synthesise a custom
  // face, and asking it to produces a fake bold on some devices and nothing
  // on others.
  const resolvedWeight = (weight ?? base.fontWeight) as TextStyle["fontWeight"];

  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: title
            ? look.display[Number(resolvedWeight) >= 800 ? "800" : Number(resolvedWeight) >= 700 ? "700" : "600"]
            : fontFamilyFor(resolvedWeight),
          fontSize: base.fontSize,
          lineHeight: base.lineHeight,
          letterSpacing: title ? -base.fontSize * 0.025 : base.letterSpacing,
          fontWeight: resolvedWeight,
          color,
        },
        tabular && { fontVariant: ["tabular-nums"] },
        center && { textAlign: "center" },
        uppercase && { textTransform: "uppercase" },
        style,
      ]}
    />
  );
}
