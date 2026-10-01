import { useEffect, useRef, useState } from "react";
import { Animated, TextInput, View, type TextInputProps } from "react-native";
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
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & { label?: string; hint?: string }) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  /*
   * The glow while typing. A field that looks the same focused and not is
   * one people tap twice to be sure, so the border warms to the accent and a
   * soft ring rises behind it.
   */
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(glow, { toValue: focused ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [focused, glow]);

  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? (
        <Text
          variant="footnote"
          weight={focused ? "600" : "400"}
          style={{ marginBottom: space.xs, color: focused ? c.accent : c.textSecondary }}
        >
          {label}
        </Text>
      ) : null}

      <View>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -3,
            left: -3,
            right: -3,
            bottom: -3,
            borderRadius: radius.control + 3,
            backgroundColor: c.accentSoft,
            opacity: glow,
          }}
        />
        <TextInput
          {...rest}
          multiline={multiline}
          placeholderTextColor={c.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              backgroundColor: c.backgroundElement,
              borderRadius: radius.control,
              borderWidth: 1.5,
              borderColor: focused ? c.accent : c.border,
              paddingHorizontal: space.md + 2,
              paddingTop: multiline ? space.md : 0,
              paddingVertical: multiline ? space.md : 0,
              height: multiline ? 104 : 50,
              textAlignVertical: multiline ? "top" : "center",
              color: c.text,
              fontSize: typeScale.body.fontSize,
            },
            style,
          ]}
        />
      </View>

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
  // Each question arrives rather than appears: a short rise and fade, keyed
  // to the title so moving to the next step plays it again.
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, useNativeDriver: false, speed: 14, bounciness: 6 }).start();
    // A question must never stay invisible because its entrance did not run.
    const safety = setTimeout(() => rise.setValue(1), 1500);
    return () => clearTimeout(safety);
  }, [title, rise]);

  return (
    <Animated.View
      style={{
        paddingHorizontal: GUTTER,
        marginBottom: space.xl,
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      <Text variant="displaySmall">{title}</Text>
      {subtitle ? (
        <Text variant="body" tone="secondary" style={{ marginTop: space.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </Animated.View>
  );
}
