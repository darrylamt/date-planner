import { useEffect, useId } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useLook } from "../../lib/appearance";
import { useReducedMotion } from "../motion";

/**
 * Durobot's face in the redesign: no mascot, a glowing orb in the look's
 * colours that breathes, and quickens while it is thinking.
 */
export function DurobotOrb({ size = 30, thinking = false }: { size?: number; thinking?: boolean }) {
  const look = useLook();
  const reduced = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const breath = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      breath.value = 0;
      return;
    }
    breath.value = 0;
    breath.value = withRepeat(withTiming(1, { duration: thinking ? 700 : 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced, thinking, breath]);

  const body = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breath.value * 0.06 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + breath.value * 0.35, transform: [{ scale: 1 + breath.value * 0.18 }] }));

  const inner = look.id === "daylight" ? "#FFD1DC" : "#FFF3D6";
  const edge = look.id === "kente" ? look.second : look.id === "night" ? "#8B5CF6" : look.colors.accent;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: look.primary },
          halo,
        ]}
      />
      <Animated.View style={body}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={`orb${uid}`} cx="38%" cy="32%" rx="70%" ry="70%">
              <Stop offset="0" stopColor={inner} />
              <Stop offset="0.45" stopColor={look.primary} />
              <Stop offset="1" stopColor={edge} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#orb${uid})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
