import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { GUTTER, radius, shadow, space } from "../theme";
import { useTheme } from "../lib/useTheme";

/**
 * Transient confirmation. Floats above the action bar rather than blocking it,
 * because most of these messages follow an action the user is mid-flow on.
 */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;

    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 9 }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDone);
    }, 3200);

    return () => clearTimeout(timer);
  }, [message, anim, onDone]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: GUTTER,
        right: GUTTER,
        bottom: insets.bottom + 96,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <View
        style={[
          {
            backgroundColor: c.text,
            borderRadius: radius.control,
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
          },
          shadow.raised,
        ]}
      >
        <Text variant="subheadline" weight="500" center style={{ color: c.background }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
