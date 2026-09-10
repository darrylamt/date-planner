import { Children, Fragment, type ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { GUTTER, HAIRLINE, radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";
import type { SymbolViewProps } from "expo-symbols";

/**
 * Grouped inset list, the iOS Settings pattern. A Group draws the rounded
 * surface and the hairlines; Rows stay unaware of their position in it.
 */
export function Group({
  header,
  footer,
  children,
  style,
  inset = true,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
  style?: ViewStyle;
  inset?: boolean;
}) {
  const c = useTheme();
  const items = Children.toArray(children).filter(Boolean);

  return (
    <View style={[{ marginBottom: space.xxl }, style]}>
      {header ? (
        <Text
          variant="footnote"
          tone="secondary"
          style={{
            marginHorizontal: inset ? GUTTER + space.lg : GUTTER,
            marginBottom: space.sm,
            textTransform: "uppercase",
          }}
        >
          {header}
        </Text>
      ) : null}

      <View
        style={{
          backgroundColor: c.backgroundElement,
          borderRadius: inset ? radius.row : 0,
          marginHorizontal: inset ? GUTTER : 0,
          overflow: "hidden",
        }}
      >
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 ? (
              <View
                style={{
                  height: HAIRLINE,
                  backgroundColor: c.border,
                  // Hairlines start after the text, not at the card edge.
                  marginLeft: space.lg,
                }}
              />
            ) : null}
            {child}
          </Fragment>
        ))}
      </View>

      {footer ? (
        <Text
          variant="footnote"
          tone="secondary"
          style={{
            marginHorizontal: inset ? GUTTER + space.lg : GUTTER,
            marginTop: space.sm,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  /** Right-aligned secondary value, e.g. "GHS 800". */
  value?: string;
  /** Leading SF Symbol. */
  icon?: SymbolViewProps["name"];
  iconColor?: string;
  onPress?: () => void;
  /** Shows a tinted checkmark and tints the title. */
  selected?: boolean;
  /** Disclosure chevron, for rows that push a screen. */
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** Replaces the trailing area entirely (switch, custom control). */
  trailing?: ReactNode;
}

export function Row({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  onPress,
  selected,
  chevron,
  destructive,
  disabled,
  trailing,
}: RowProps) {
  const c = useTheme();

  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: subtitle ? 10 : 12,
        minHeight: 44, // HIG minimum touch target
      }}
    >
      {icon ? <Symbol name={icon} size={20} color={iconColor ?? c.accent} /> : null}

      <View style={{ flex: 1, gap: 1 }}>
        <Text
          variant="body"
          weight={selected ? "600" : "400"}
          style={{ color: destructive ? c.danger : selected ? c.accent : c.text }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ??
        (value ? (
          <Text variant="body" tone="secondary" tabular>
            {value}
          </Text>
        ) : null)}

      {selected && !trailing ? <Symbol name="checkmark" size={16} weight="semibold" /> : null}
      {chevron && !trailing ? (
        <Symbol name="chevron.right" size={14} color={c.textTertiary} weight="semibold" />
      ) : null}
    </View>
  );

  if (!onPress) return <View style={{ opacity: disabled ? 0.4 : 1 }}>{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? c.backgroundSunken : "transparent",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {body}
    </Pressable>
  );
}
