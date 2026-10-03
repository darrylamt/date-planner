import { useEffect, useRef } from "react";
import { Alert, Animated, Dimensions, Easing, Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { useBurst } from "../Burst";
import { appIconsAvailable, setHalloweenIcon } from "../AppIconPicker";
import { useReducedMotion } from "../motion";
import { radius, space } from "../../theme";
import { MeshBackground } from "../native/MeshBackground";

const NIGHT = "#0D0015";
const LOGO = require("../../../assets/halloween/logo.png");

/**
 * The Halloween banner on Home: the season's logo on its own night, and a
 * way into a plan. Only drawn while the season is on (see season.tsx).
 *
 * The logo keeps a secret: three quick taps and it says boo, seven and the
 * bats come out. The plan starts from the line underneath, so playing with
 * the logo never opens the planner by accident.
 */
export function HalloweenBanner({ onPlan }: { onPlan: () => void }) {
  const burst = useBurst();
  const taps = useRef<number[]>([]);

  function poke(x: number, y: number) {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    const n = taps.current.length;
    if (n === 3) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      burst(x, y, ["👻"], 1, 64);
      burst(x, y, ["👻", "💀"], 5);
    } else if (n >= 7) {
      taps.current = [];
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      burst(x, y, ["🦇"], 24);
    } else {
      void Haptics.selectionAsync();
    }
  }

  return (
    <View style={{ marginTop: space.lg, borderRadius: radius.card, backgroundColor: NIGHT, overflow: "hidden" }}>
      <MeshBackground
        period={6000}
        colors={[NIGHT, "#2A0B45", NIGHT, "#D9480F40", NIGHT, "#4A1475", NIGHT, "#FF922B30", NIGHT]}
      />
      <Pressable
        onPress={(e) => poke(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        accessibilityLabel="Duro! Halloween logo"
      >
        <Image source={LOGO} style={{ width: "100%", aspectRatio: 920 / 365 }} contentFit="contain" accessibilityIgnoresInvertColors />
      </Pressable>
      <Pressable
        onPress={onPlan}
        accessibilityRole="button"
        accessibilityLabel="Plan a night out for Halloween"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: space.lg,
          paddingTop: space.xs,
          paddingBottom: space.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {appIconsAvailable() ? (
          // The season's icon, one tap; iOS confirms a change itself, so only a failure is said.
          <Pressable
            hitSlop={8}
            onPress={() =>
              void setHalloweenIcon().then((msg) => {
                if (!msg.startsWith("Spooky")) Alert.alert("Halloween icon", msg);
              })
            }
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: space.sm,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: "rgba(255,146,43,0.16)",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="footnote" weight="700" style={{ color: "#FFE3C2" }}>
              Get the icon
            </Text>
          </Pressable>
        ) : (
          <Text variant="subheadline" weight="700" style={{ color: "#FFE3C2", flex: 1 }}>
            Spooky season in Accra
          </Text>
        )}
        <Text variant="subheadline" weight="800" style={{ color: "#FF922B" }}>
          Plan a night 🎃
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Bats and a ghost drifting across the top of Home, behind everything and
 * untouchable. Decoration only, so the native driver, and nothing at all
 * under Reduce Motion.
 */
export function SpookyDrift() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const width = Dimensions.get("window").width;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 320 }}>
      <Drifter glyph="🦇" size={22} top={40} width={width} duration={14000} delay={0} />
      <Drifter glyph="🦇" size={16} top={110} width={width} duration={18000} delay={4000} reverse />
      <Drifter glyph="👻" size={24} top={210} width={width} duration={22000} delay={9000} />
    </View>
  );
}

function Drifter({
  glyph,
  size,
  top,
  width,
  duration,
  delay,
  reverse = false,
}: {
  glyph: string;
  size: number;
  top: number;
  width: number;
  duration: number;
  delay: number;
  reverse?: boolean;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t, duration, delay]);

  const from = reverse ? width + 40 : -40;
  const to = reverse ? -40 : width + 40;
  return (
    <Animated.Text
      style={{
        position: "absolute",
        top,
        fontSize: size,
        opacity: 0.55,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) },
          // A lazy bob as it goes, three times across the screen.
          { translateY: t.interpolate({ inputRange: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1], outputRange: [0, -10, 0, -10, 0, -10, 0] }) },
          { scaleX: reverse ? -1 : 1 },
        ],
      }}
    >
      {glyph}
    </Animated.Text>
  );
}
