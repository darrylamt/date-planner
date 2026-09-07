import { TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { GUTTER, radius, space, type as typeScale } from "../theme";
import { useTheme } from "../lib/useTheme";

/**
 * Labelled text input. Sits on the grouped background as its own card so it
 * reads as a field rather than a list row.
 */
export function Field({
  label,
  hint,
  multiline,
  style,
  ...rest
}: TextInputProps & { label?: string; hint?: string }) {
  const c = useTheme();

  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? (
        <Text variant="footnote" tone="secondary" style={{ marginBottom: space.xs }}>
          {label}
        </Text>
      ) : null}

      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={c.textTertiary}
        style={[
          {
            backgroundColor: c.backgroundElement,
            borderRadius: radius.control,
            paddingHorizontal: space.md,
            paddingTop: multiline ? space.md : 0,
            paddingVertical: multiline ? space.md : 0,
            height: multiline ? 92 : 44,
            textAlignVertical: multiline ? "top" : "center",
            color: c.text,
            fontSize: typeScale.body.fontSize,
          },
          style,
        ]}
      />

      {hint ? (
        <Text variant="caption1" tone="tertiary" style={{ marginTop: space.xs }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Section heading used on the step screens. */
export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ paddingHorizontal: GUTTER, marginBottom: space.xl }}>
      <Text variant="displaySmall">{title}</Text>
      {subtitle ? (
        <Text variant="body" tone="secondary" style={{ marginTop: space.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
