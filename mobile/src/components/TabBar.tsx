import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Symbol } from "./Symbol";
import { TAB_BAR, radius, shadow } from "../theme";
import { useIsDark } from "../lib/useTheme";
import type { SymbolViewProps } from "expo-symbols";

/**
 * Structural subset of the tab bar props. expo-router ships its own copy of
 * the react-navigation types, so importing them from the standalone package
 * produces two incompatible declarations of the same shape. Only `state` and
 * `navigation` are used here, so they are described directly.
 */
interface TabBarProps {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: {
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

const ICONS: Record<string, SymbolViewProps["name"]> = {
  index: "sparkles",
  saved: "bookmark.fill",
  profile: "person.fill",
};

const LABELS: Record<string, string> = {
  index: "Plan",
  saved: "Saved",
  profile: "You",
};

/**
 * Floating pill navigation: a dark capsule over the content, icons only, with
 * the active tab marked by a filled circle rather than a tint change.
 *
 * Labels are dropped because three destinations at fixed positions are learned
 * almost immediately, and the icons carry accessibility labels for anyone
 * using VoiceOver.
 */
export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();

  // High contrast against the page in both schemes: near-black on light,
  // a raised charcoal on dark so the pill still reads as a separate surface.
  const pill = isDark ? "#1F1F22" : "#111113";
  const activeCircle = isDark ? "#FFFFFF" : "#FFFFFF";
  const activeIcon = "#111113";
  const inactiveIcon = "rgba(255, 255, 255, 0.55)";

  return (
    <View
      style={[
        {
          position: "absolute",
          left: TAB_BAR.inset + 8,
          right: TAB_BAR.inset + 8,
          bottom: (insets.bottom || 12) + 4,
          height: TAB_BAR.height,
          borderRadius: radius.pill,
          backgroundColor: pill,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          paddingHorizontal: 10,
        },
        shadow.raised,
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const icon = ICONS[route.name] ?? "circle";

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
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate(route.name);
            }}
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: focused ? activeCircle : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Symbol
              name={icon}
              size={21}
              color={focused ? activeIcon : inactiveIcon}
              weight={focused ? "bold" : "regular"}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
