import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Symbol } from "./Symbol";
import { Elevation, HAIRLINE, Motion, Radius, Spacing, TAB_BAR } from "../theme";
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

const ICONS: Record<string, SymbolViewProps["name"]> = {
  index: "house.fill",
  saved: "bookmark.fill",
  profile: "person.fill",
};

const LABELS: Record<string, string> = {
  index: "Home",
  saved: "Saved",
  profile: "You",
};

/** Inset of the sliding pill inside the bar. */
const INSET = 5;

/**
 * Navigation grouped in a glass bar, with the primary action as its own button
 * on the right.
 *
 * Creating a plan is what this app exists for, so it is a peer of the nav
 * rather than buried in a screen, but deliberately NOT a tab, because it
 * starts a task instead of switching destination.
 *
 * The selection is a single pill that slides between slots rather than a
 * highlight that blinks on and off. It echoes the bar's own shape, so the
 * selected tab reads as part of the bar rather than a circle sitting inside it.
 */
export function TabBar({
  state,
  navigation,
  onCreate,
}: TabBarProps & { onCreate: () => void }) {
  const c = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();

  const [barWidth, setBarWidth] = useState(0);
  const count = state.routes.length;
  const slot = barWidth > 0 ? (barWidth - INSET * 2) / count : 0;

  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (slot === 0) return;
    Animated.spring(slide, {
      toValue: INSET + state.index * slot,
      useNativeDriver: true,
      // Firm enough to feel responsive, damped enough not to wobble.
      stiffness: 220,
      damping: 24,
      mass: 0.9,
    }).start();
  }, [state.index, slot, slide]);

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
      {/* Destinations. Blurred glass so scrolled content reads through it. */}
      <BlurView
        intensity={Platform.OS === "ios" ? 40 : 0}
        tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={[
          {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            height: TAB_BAR.height,
            borderRadius: Radius.pill,
            borderWidth: HAIRLINE,
            borderColor: c.glassBorder,
            backgroundColor: c.glass,
            // Required, or the blur paints past the rounded corners.
            overflow: "hidden",
          },
          Elevation.raised,
        ]}
      >
        {/* The sliding selection. Behind the icons and untouchable, so it can
            never intercept a tap meant for a tab. */}
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: INSET,
              width: slot,
              height: TAB_BAR.height - INSET * 2,
              borderRadius: Radius.pill,
              backgroundColor: c.accentSoft,
              transform: [{ translateX: slide }],
            }}
          />
        ) : null}

        {state.routes.map((route, index) => {
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={LABELS[route.name] ?? route.name}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (focused || event.defaultPrevented) return;
                void Haptics.selectionAsync();
                navigation.navigate(route.name);
              }}
              style={({ pressed }) => ({
                flex: 1,
                height: TAB_BAR.height,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Symbol
                name={ICONS[route.name] ?? "circle"}
                size={23}
                color={focused ? c.accent : c.textSecondary}
                weight={focused ? "semibold" : "regular"}
              />
            </Pressable>
          );
        })}
      </BlurView>

      {/* Primary action. The only accent-filled control on screen. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New plan"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onCreate();
        }}
        style={({ pressed }) => [
          {
            width: TAB_BAR.height,
            height: TAB_BAR.height,
            borderRadius: TAB_BAR.height / 2,
            backgroundColor: c.brand,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
          },
          Elevation.raised,
        ]}
      >
        <Symbol name="plus" size={25} color={c.textOnBrand} weight="semibold" />
      </Pressable>
    </View>
  );
}

/** Kept so callers importing timing from here still resolve. */
export const TAB_MOTION = Motion;
