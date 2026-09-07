import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Symbol } from "./Symbol";
import { Elevation, HAIRLINE, Radius, Spacing, TAB_BAR } from "../theme";
import { useTheme } from "../lib/useTheme";
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

/**
 * Navigation grouped left, with the primary action as its own button on the
 * right.
 *
 * Creating a plan is the thing this app exists for, and burying it inside a
 * screen meant it moved depending on where you were. As a peer of the nav it
 * is always in the same place — but deliberately NOT a tab, because it starts
 * a task rather than switching destination.
 *
 * The trade-off against the system tab bar is real: blur, scroll-edge
 * behaviour and Dynamic Type sizing all have to be approximated here.
 */
export function TabBar({
  state,
  navigation,
  onCreate,
}: TabBarProps & { onCreate: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

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
      {/* Destinations */}
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            height: TAB_BAR.height,
            paddingHorizontal: Spacing.two,
            borderRadius: Radius.pill,
            borderWidth: HAIRLINE,
            borderColor: c.border,
            backgroundColor: c.backgroundElement,
          },
          Elevation.raised,
        ]}
      >
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
                width: 50,
                height: 50,
                borderRadius: 25,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? c.backgroundSelected : "transparent",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Symbol
                name={ICONS[route.name] ?? "circle"}
                size={20}
                color={focused ? c.text : c.textTertiary}
                weight={focused ? "semibold" : "regular"}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

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
        <Symbol name="plus" size={22} color={c.textOnBrand} weight="semibold" />
      </Pressable>
    </View>
  );
}
