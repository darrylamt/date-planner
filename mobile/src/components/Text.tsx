import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { type as typeScale } from "../theme";
import { useTheme } from "../lib/useTheme";

type Variant = keyof typeof typeScale;
type Tone = "label" | "secondary" | "tertiary" | "quaternary" | "tint" | "onTint" | "red" | "green" | "orange";

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: TextStyle["fontWeight"];
  /** Tabular figures — use for prices, times and any column of numbers. */
  tabular?: boolean;
  center?: boolean;
  uppercase?: boolean;
}

/**
 * Themed text. Defaults to the system face (SF Pro on iOS) — deliberately no
 * custom font, so Dynamic Type and the native look come for free.
 */
export function Text({
  variant = "body",
  tone = "label",
  weight,
  tabular,
  center,
  uppercase,
  style,
  ...rest
}: AppTextProps) {
  const c = useTheme();
  const base = typeScale[variant];

  const color =
    tone === "label"
      ? c.label
      : tone === "secondary"
        ? c.secondaryLabel
        : tone === "tertiary"
          ? c.tertiaryLabel
          : tone === "quaternary"
            ? c.quaternaryLabel
            : tone === "tint"
              ? c.tint
              : tone === "onTint"
                ? c.onTint
                : tone === "red"
                  ? c.red
                  : tone === "green"
                    ? c.green
                    : c.orange;

  return (
    <RNText
      {...rest}
      style={[
        {
          fontSize: base.fontSize,
          lineHeight: base.lineHeight,
          letterSpacing: base.letterSpacing,
          fontWeight: (weight ?? base.fontWeight) as TextStyle["fontWeight"],
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
