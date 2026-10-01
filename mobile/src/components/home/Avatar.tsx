import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { useReducedMotion } from "../motion";
import { useTheme } from "../../lib/useTheme";

const SIZE = 54;
const GOLD = "#E5B04E";
const GOLD_DEEP = "#C98E1E";

/**
 * You, at the top of Home.
 *
 * A calm circle for everybody: the picture in a thin ring with a gap of page
 * between, the way a story ring sits off a photo. Pro turns the ring gold,
 * gives it a soft glow, and pins a gold star to the top right corner, which
 * pops in when the account is known to be Pro and twinkles now and then.
 *
 * It used to wear the adurobot bar's four colours, which made two loud
 * things side by side; the bar keeps the colour and this keeps its place.
 */
export function Avatar({
  avatarUrl,
  initial,
  pro,
  onPress,
}: {
  avatarUrl: string | null;
  initial: string | null;
  pro: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const signedIn = Boolean(avatarUrl || initial);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pro ? "You and settings, Pro account" : "You and settings"}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: SIZE, height: SIZE, opacity: pressed ? 0.75 : 1 })}
    >
      <View
        style={{
          flex: 1,
          borderRadius: SIZE / 2,
          borderWidth: pro ? 2.5 : 1.5,
          borderColor: pro ? GOLD : c.border,
          padding: 2.5,
          backgroundColor: c.background,
          shadowColor: pro ? GOLD : "#000",
          shadowOpacity: pro ? 0.55 : 0.08,
          shadowRadius: pro ? 10 : 6,
          shadowOffset: { width: 0, height: pro ? 0 : 2 },
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: SIZE,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: signedIn ? c.accent : c.backgroundElement,
          }}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : initial ? (
            <Text variant="headline" style={{ color: "#FFFFFF" }}>
              {initial}
            </Text>
          ) : (
            <Symbol name="person.fill" size={20} color={c.textSecondary} />
          )}
        </View>
      </View>

      {pro ? <ProStar /> : null}
    </Pressable>
  );
}

/**
 * The gold star on a Pro avatar.
 *
 * Its arrival is on the JS driver with a safety, because the star is the
 * information and must never be left hidden; the twinkle is decoration on
 * the native driver, on its own inner view so the two never share a node.
 */
function ProStar() {
  const c = useTheme();
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      pop.setValue(1);
      return;
    }
    Animated.spring(pop, { toValue: 1, delay: 250, useNativeDriver: false, speed: 10, bounciness: 16 }).start();
    const safety = setTimeout(() => pop.setValue(1), 1600);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(3200),
        Animated.timing(twinkle, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      clearTimeout(safety);
      loop.stop();
    };
  }, [reduced, pop, twinkle]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -3,
        right: -3,
        opacity: pop,
        transform: [
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
          { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) },
        ],
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: GOLD,
          borderWidth: 2,
          borderColor: c.background,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: GOLD_DEEP,
          shadowOpacity: 0.6,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
        }}
      >
        <Animated.View
          style={{
            transform: [
              { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
              { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "72deg"] }) },
            ],
          }}
        >
          <Symbol name="star.fill" size={10} weight="bold" color="#FFFFFF" />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
