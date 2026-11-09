import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Text } from "./Text";
import { Elevation, HAIRLINE, Radius, Spacing } from "../theme";
import { useTheme } from "../lib/useTheme";

/**
 * A line in a bubble, fading its text when the line changes rather than
 * swapping mid-sentence. It used to point down at the mascot with a pixel-art
 * tail; with no mascot in the redesign there is nothing to point at.
 */
export function SpeechBubble({
  text,
  align = "center",
}: {
  text: string;
  align?: "left" | "center";
}) {
  const c = useTheme();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [text, fade]);

  return (
    <Animated.View style={{ opacity: fade, alignItems: align === "center" ? "center" : "flex-start" }}>
      <View
        style={[
          {
            backgroundColor: c.backgroundElement,
            borderRadius: Radius.xl,
            borderWidth: HAIRLINE,
            borderColor: c.border,
            paddingHorizontal: Spacing.three,
            paddingVertical: Spacing.two + 2,
            maxWidth: 300,
          },
          Elevation.card,
        ]}
      >
        <Text variant="callout" center={align === "center"}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}
