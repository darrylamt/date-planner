import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

/**
 * Small pieces of motion, shared so every screen moves the same way.
 *
 * Built on React Native's own Animated with the native driver, so they run
 * off the JavaScript thread and add no native module: they reach phones over
 * the air like any other change.
 */

/**
 * Content that arrives rather than appears: a short rise and fade, after
 * `delay` ms. Change `trigger` to play it again, for content that is
 * replaced in place, like a menu re-dealt when the category changes.
 */
export function Rise({
  children,
  delay = 0,
  distance = 16,
  trigger,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  trigger?: unknown;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, speed: 12, bounciness: 5 }).start();
  }, [trigger, delay, v]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A Pressable that gives under the finger and springs back. `to` is how far
 * it gives: 0.96 for a card, 0.9 for a small round button.
 */
export function PressScale({
  children,
  to = 0.96,
  style,
  ...rest
}: Omit<PressableProps, "style" | "children"> & { children: ReactNode; to?: number; style?: StyleProp<ViewStyle> }) {
  const s = useRef(new Animated.Value(1)).current;
  const springTo = (v: number) =>
    Animated.spring(s, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v === 1 ? 10 : 0 }).start();

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        springTo(to);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        springTo(1);
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
