import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View, type ViewStyle } from "react-native";
import { Radius } from "../../theme";

/**
 * A slow halo behind its child, for the one control people keep missing.
 *
 * People walked past the adurobot bar: it sat at the top of Home looking like
 * a search field, and a search field is something you already know you do
 * not need. A light breathing behind it says "this does something" without
 * adding a word or a badge.
 *
 * Opacity only, on the native driver, so it costs nothing on the JS thread
 * and keeps going while the screen scrolls. Still under Reduce Motion: the
 * halo stays, lit and not moving, because that setting asks for less
 * movement, not less colour.
 */
export function Glow({
  children,
  colors = ["#7C5CFF", "#FF5CA8"],
  style,
}: {
  children: React.ReactNode;
  colors?: [string, string];
  style?: ViewStyle;
}) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => active && setStill(on));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setStill);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (still) {
      pulse.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [still, pulse]);

  /*
   * Two offset halos rather than one, so the light has the bar's own colours
   * in it instead of a single flat purple. Each is a shadow cast by a view the
   * size of the bar; the view itself is hidden behind the child.
   */
  const halo = (color: string, dx: number): ViewStyle => ({
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 6 + dx,
    right: 6 - dx,
    borderRadius: Radius.pill,
    backgroundColor: color,
    shadowColor: color,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  });

  return (
    <View style={style}>
      <Animated.View pointerEvents="none" style={[halo(colors[0], -10), { opacity: pulse }]} />
      <Animated.View pointerEvents="none" style={[halo(colors[1], 10), { opacity: pulse }]} />
      {children}
    </View>
  );
}
