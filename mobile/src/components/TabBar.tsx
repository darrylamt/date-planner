import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Symbol } from "./Symbol";
import { Text } from "./Text";
import { Glass, liquidGlass } from "./Glass";
import { useReducedMotion } from "./motion";
import { Elevation, Motion, Spacing, TAB_BAR } from "../theme";
import { useIsDark, useTheme } from "../lib/useTheme";
import type { SymbolViewProps } from "expo-symbols";

/**
 * Structural subset of the tab bar props. expo-router ships its own copy of
 * the react-navigation types, so importing them from the standalone package
 * produces two incompatible declarations of the same shape.
 */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

/** Outline at rest, filled when chosen, the way the system's own tab bars do it. */
const ICONS: Record<string, { off: SymbolViewProps["name"]; on: SymbolViewProps["name"] }> = {
  index: { off: "house", on: "house.fill" },
  venues: { off: "map", on: "map.fill" },
  calendar: { off: "calendar", on: "calendar" },
  saved: { off: "bookmark", on: "bookmark.fill" },
  profile: { off: "person", on: "person.fill" },
};

const LABELS: Record<string, string> = {
  index: "Home",
  venues: "Venues",
  calendar: "Calendar",
  saved: "Saved",
  profile: "You",
};

/** Inset of the lens inside the bar. */
const INSET = 5;

/**
 * Navigation in a floating bar of glass, with the primary action as its own
 * glass button on the right.
 *
 * Creating a plan is what the app exists for, so it is a peer of the nav
 * rather than buried in a screen, but not a tab, because it starts a task
 * instead of switching destination.
 *
 * The selection is a lens of brighter glass that slides between tabs and
 * stretches as it travels, like a drop of liquid, then settles. A tap sends a
 * ripple through the bar and bounces the icon. On iOS 26 with the native
 * module, the bar and the button are Apple's own Liquid Glass; anywhere else
 * a blur with a sheen stands in (see Glass).
 */
export function TabBar({ state, navigation, onCreate }: TabBarProps & { onCreate: () => void }) {
  const c = useTheme();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const [barWidth, setBarWidth] = useState(0);
  const count = state.routes.length;
  const slot = barWidth > 0 ? (barWidth - INSET * 2) / count : 0;

  // All decoration, so the native driver: if it does not run, the lens simply
  // jumps and the bar still works.
  const slide = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const [rippleAt, setRippleAt] = useState(0);
  const placed = useRef(false);

  useEffect(() => {
    if (slot === 0) return;
    const to = INSET + state.index * slot;
    // The first time the bar is measured, the lens is simply put there.
    if (!placed.current || reduced) {
      placed.current = true;
      slide.setValue(to);
      return;
    }
    Animated.parallel([
      Animated.spring(slide, { toValue: to, useNativeDriver: true, stiffness: 240, damping: 22, mass: 0.9 }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 12 }),
      ]),
    ]).start();
  }, [state.index, slot, slide, stretch, reduced]);

  function rippleFrom(index: number) {
    if (reduced) return;
    setRippleAt(index);
    ripple.setValue(0);
    Animated.timing(ripple, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }

  const lensH = TAB_BAR.height - INSET * 2;

  return (
    <View
      style={{
        position: "absolute",
        left: Spacing.four,
        right: Spacing.four,
        bottom: (insets.bottom || Spacing.three) + Spacing.one,
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
      }}
    >
      {/* ── the destinations ── */}
      <Glass
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={[{ flex: 1, height: TAB_BAR.height, borderRadius: TAB_BAR.height / 2, flexDirection: "row", alignItems: "center" }, Elevation.raised]}
      >
        {/* The ripple from a tap, behind everything and untouchable. */}
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: INSET + rippleAt * slot + slot / 2 - lensH / 2,
              top: INSET,
              width: lensH,
              height: lensH,
              borderRadius: lensH / 2,
              backgroundColor: c.accent,
              opacity: ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.22, 0] }),
              transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.4] }) }],
            }}
          />
        ) : null}

        {/* The lens: brighter glass over the chosen tab, stretching as it slides. */}
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: INSET,
              width: slot,
              height: lensH,
              borderRadius: lensH / 2,
              // A tinted drop in light mode: white on frosted white is invisible.
              backgroundColor: liquidGlass ? "rgba(255,255,255,0.18)" : dark ? "rgba(255,255,255,0.12)" : c.accentSoft,
              borderWidth: 1,
              borderColor: dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.95)",
              shadowColor: "#000",
              shadowOpacity: dark ? 0.3 : 0.1,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              transform: [
                { translateX: slide },
                { scaleX: stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) },
                { scaleY: stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) },
              ],
            }}
          />
        ) : null}

        {state.routes.map((route, index) => (
          <Tab
            key={route.key}
            name={route.name}
            focused={state.index === index}
            reduced={reduced}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              rippleFrom(index);
              if (state.index === index || event.defaultPrevented) return;
              void Haptics.selectionAsync();
              navigation.navigate(route.name);
            }}
          />
        ))}
      </Glass>

      {/* ── the primary action: the one coloured control on the screen ── */}
      <CreateButton onPress={onCreate} reduced={reduced} />
    </View>
  );
}

/** One destination: an icon that bounces when tapped, and its name under it. */
function Tab({
  name,
  focused,
  reduced,
  onPress,
}: {
  name: string;
  focused: boolean;
  reduced: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const bounce = useRef(new Animated.Value(1)).current;
  const icons = ICONS[name] ?? { off: "circle", on: "circle.fill" };

  function pop() {
    if (reduced) return;
    bounce.setValue(0.72);
    Animated.spring(bounce, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 16 }).start();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={LABELS[name] ?? name}
      onPressIn={() => {
        if (!reduced) Animated.spring(bounce, { toValue: 0.86, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
      }}
      onPress={() => {
        pop();
        onPress();
      }}
      onPressOut={() => {
        if (!reduced) Animated.spring(bounce, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 12 }).start();
      }}
      style={{ flex: 1, height: TAB_BAR.height, alignItems: "center", justifyContent: "center", gap: 2 }}
    >
      <Animated.View
        style={{
          transform: [
            { scale: bounce },
            { translateY: bounce.interpolate({ inputRange: [0.72, 1], outputRange: [3, 0], extrapolate: "clamp" }) },
          ],
        }}
      >
        <Symbol
          name={focused ? icons.on : icons.off}
          size={22}
          color={focused ? c.accent : c.textSecondary}
          weight={focused ? "semibold" : "regular"}
        />
      </Animated.View>
      <Text
        variant="caption2"
        weight={focused ? "700" : "500"}
        style={{ color: focused ? c.accent : c.textSecondary, letterSpacing: 0.1 }}
      >
        {LABELS[name] ?? name}
      </Text>
    </Pressable>
  );
}

/** New plan: a drop of coloured glass whose plus turns as it is pressed. */
function CreateButton({ onPress, reduced }: { onPress: () => void; reduced: boolean }) {
  const c = useTheme();
  const press = useRef(new Animated.Value(0)).current;
  const to = (v: number) =>
    Animated.spring(press, { toValue: v, useNativeDriver: true, speed: 30, bounciness: v === 0 ? 12 : 0 }).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New plan"
      onPressIn={() => !reduced && to(1)}
      onPressOut={() => !reduced && to(0)}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
    >
      <Animated.View
        style={[
          // Rounded, so the shadow is the shape of the button and not of its box.
          { borderRadius: TAB_BAR.height / 2, transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }] },
          Elevation.raised,
          { shadowColor: c.brand, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
        ]}
      >
        <Glass
          tint={c.brand}
          interactive
          style={{ width: TAB_BAR.height, height: TAB_BAR.height, borderRadius: TAB_BAR.height / 2, alignItems: "center", justifyContent: "center" }}
        >
          <Animated.View style={{ transform: [{ rotate: press.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}>
            <Symbol name="plus" size={25} color={c.textOnBrand} weight="bold" />
          </Animated.View>
        </Glass>
      </Animated.View>
    </Pressable>
  );
}

/** Kept so callers importing timing from here still resolve. */
export const TAB_MOTION = Motion;
