import { ActivityIndicator, Pressable, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";
import type { SymbolViewProps } from "expo-symbols";

type Kind = "filled" | "tinted" | "gray" | "plain" | "destructive";
type Size = "large" | "medium" | "small";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  kind?: Kind;
  size?: Size;
  icon?: SymbolViewProps["name"];
  disabled?: boolean;
  loading?: boolean;
  /** Fill the parent's width. Large buttons do this by default. */
  block?: boolean;
  style?: ViewStyle;
}

const HEIGHT: Record<Size, number> = { large: 50, medium: 40, small: 32 };

/** iOS button styles: filled, tinted, gray, plain — matching HIG naming. */
export function Button({
  title,
  onPress,
  kind = "filled",
  size = "large",
  icon,
  disabled,
  loading,
  block,
  style,
}: ButtonProps) {
  const c = useTheme();
  const inert = disabled || loading;

  const bg =
    kind === "filled"
      ? inert
        ? c.fill
        : c.tint
      : kind === "tinted"
        ? c.tintMuted
        : kind === "gray"
          ? c.fill
          : "transparent";

  const fg =
    kind === "filled"
      ? inert
        ? c.quaternaryLabel
        : c.onTint
      : kind === "destructive"
        ? c.red
        : inert
          ? c.quaternaryLabel
          : kind === "gray"
            ? c.label
            : c.tint;

  const isBlock = block ?? size === "large";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      disabled={inert}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        {
          height: HEIGHT[size],
          borderRadius: kind === "plain" || kind === "destructive" ? 0 : radius.control,
          backgroundColor: bg,
          paddingHorizontal: kind === "plain" || kind === "destructive" ? 0 : space.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          alignSelf: isBlock ? "stretch" : "flex-start",
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Symbol name={icon} size={size === "small" ? 14 : 17} color={fg} weight="semibold" /> : null}
          <Text
            variant={size === "small" ? "subheadline" : "body"}
            weight="600"
            style={{ color: fg }}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Bottom action bar that floats above the home indicator. */
export function ActionBar({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  return (
    <View
      style={[
        {
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          gap: space.sm,
          borderTopWidth: 0.5,
          borderTopColor: c.separator,
          backgroundColor: c.background,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
