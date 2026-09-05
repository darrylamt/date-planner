import type { ReactNode } from "react";
import { ScrollView, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "../theme";
import { useIsDark, useTheme } from "../lib/useTheme";

/**
 * Screen chrome. `grouped` picks the grey backdrop that inset lists sit on;
 * plain screens use systemBackground.
 */
export function Screen({
  children,
  grouped,
  scroll = true,
  footer,
  contentStyle,
}: {
  children: ReactNode;
  grouped?: boolean;
  scroll?: boolean;
  /** Pinned below the scroll area — action bars, primary buttons. */
  footer?: ReactNode;
  contentStyle?: ViewStyle;
}) {
  const c = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const bg = grouped ? c.groupedBackground : c.background;

  const inner = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        { paddingBottom: footer ? space.xxl : insets.bottom + space.xxl },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      indicatorStyle={isDark ? "white" : "black"}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {inner}
      {footer ? <View style={{ paddingBottom: insets.bottom || space.lg }}>{footer}</View> : null}
    </View>
  );
}
