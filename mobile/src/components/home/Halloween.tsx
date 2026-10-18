import { useEffect, useRef } from "react";
import { Alert, Animated, Dimensions, Easing, Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { useBurst } from "../Burst";
import { appIconsAvailable, setHalloweenIcon } from "../AppIconPicker";
import { PressScale, useReducedMotion } from "../motion";
import { Mascot } from "../Mascot";
import { Radius, Spacing, radius, space } from "../../theme";

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

/** This year's Halloween as YYYY-MM-DD while it is still ahead, else null. */
export function halloweenDate(now: Date = new Date()): string | null {
  const iso = `${now.getFullYear()}-10-31`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return today <= iso ? iso : null;
}

/**
 * The season's card, first in the occasion row: friends out in front of an
 * orange moon, and one tap to plan Halloween night itself (the 31st, from 7pm; the
 * planner still asks who it is with).
 *
 * It replaced a pill that only said the season was on. A card in the row is
 * where people are already looking and choosing, so the season becomes
 * something to do rather than a label. After the 31st it stays for the rest
 * of the season without a date.
 *
 * The pumpkin keeps the old banner's secret: three quick taps say boo, seven
 * bring the bats. It is its own button, so playing with it never opens the
 * planner.
 */
export function HalloweenCard({ width, onPlan }: { width: number; onPlan: (date: string | null) => void }) {
  const burst = useBurst();
  const taps = useRef<number[]>([]);
  const date = halloweenDate();
  const day = date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" }) : null;

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
    <PressScale
      onPress={() => onPlan(date)}
      accessibilityRole="button"
      accessibilityLabel={date ? "Plan Halloween night, the 31st" : "Plan a night out for spooky season"}
      style={{
        width,
        minHeight: 176,
        padding: Spacing.three,
        borderRadius: Radius.xl,
        backgroundColor: NIGHT,
        overflow: "hidden",
        justifyContent: "space-between",
      }}
    >
      {/* A harvest moon with friends in front of it, and a few stars: drawn, so no new image ships. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 4, left: 4, width: 104, height: 104, borderRadius: 52, backgroundColor: "rgba(255,146,43,0.12)" }} />
      <View pointerEvents="none" style={{ position: "absolute", top: 16, left: 16, width: 80, height: 80, borderRadius: 40, backgroundColor: "#FF922B" }} />
      {STARS.map(([top, right, size], i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: "absolute", top, right, width: size, height: size, borderRadius: size, backgroundColor: "rgba(255,227,194,0.75)" }}
        />
      ))}

      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Mascot occasion="friend_outing" size={72} animate={false} style={{ marginLeft: 8, marginTop: 14 }} />
        <Pressable
          hitSlop={10}
          onPress={(e) => poke(e.nativeEvent.pageX, e.nativeEvent.pageY)}
          accessibilityLabel="Pumpkin"
          style={{ marginLeft: 2 }}
        >
          <Text style={{ fontSize: 24 }}>🎃</Text>
        </Pressable>
      </View>

      <View style={{ gap: 2 }}>
        <Text variant="headline" numberOfLines={2} style={{ color: "#FF922B" }}>
          {date ? "Halloween night" : "Spooky season"}
        </Text>
        <Text variant="footnote" numberOfLines={2} style={{ color: "rgba(255,227,194,0.78)" }}>
          {date ? `${day} 31 Oct, from 7pm` : "A few spooky nights left in Accra."}
        </Text>
        {appIconsAvailable() ? (
          // The season's icon, one tap; iOS confirms a change itself, so only a failure is said.
          <Pressable
            hitSlop={8}
            onPress={() =>
              void setHalloweenIcon().then((msg) => {
                if (!msg.startsWith("Spooky")) Alert.alert("Halloween icon", msg);
              })
            }
            style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: Spacing.one, opacity: pressed ? 0.6 : 1 })}
          >
            <Text variant="caption1" weight="700" style={{ color: "#FF922B" }}>
              Get the icon ›
            </Text>
          </Pressable>
        ) : null}
      </View>
    </PressScale>
  );
}

/** [top, right, size] for the card's stars, on the dark side away from the moon. */
const STARS: [number, number, number][] = [
  [16, 18, 3],
  [34, 40, 2],
  [52, 14, 2],
  [72, 30, 2],
  [12, 52, 2],
];

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
