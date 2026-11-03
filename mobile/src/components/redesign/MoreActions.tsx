import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from "react-native-reanimated";
import Svg, { Circle, Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";
import type { SymbolViewProps } from "expo-symbols";
import { Symbol } from "../Symbol";
import { useLook } from "../../lib/appearance";
import { useReducedMotion } from "../motion";
import { Body } from "../look";

/*
 * A stop's lesser actions (owner, 2 Nov 2026: "instead of only the 3 dots,
 * maybe it should be morphing into different icons of what it holds"). The
 * button shows what is inside, one icon at a time, and opens into a row in
 * place rather than a sheet from the bottom of the screen.
 */

export type MoreItem = {
  key: string;
  label: string;
  icon: SymbolViewProps["name"] | "instagram";
  onPress: () => void;
  danger?: boolean;
};

/** Instagram's mark, which SF Symbols does not carry: a rounded square, a ring and a dot. */
export function InstagramGlyph({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="3" width="18" height="18" rx="5.5" stroke={color} strokeWidth={2} fill="none" />
      <Circle cx="12" cy="12" r="4.2" stroke={color} strokeWidth={2} fill="none" />
      <Circle cx="17.3" cy="6.7" r="1.3" fill={color} />
    </Svg>
  );
}

function ItemIcon({ item, size, color }: { item: MoreItem; size: number; color: string }) {
  return item.icon === "instagram" ? <InstagramGlyph size={size} color={color} /> : <Symbol name={item.icon} size={size} color={color} />;
}

/** The round button: it turns through the icons of what it holds. */
export function MorphButton({ items, onPress }: { items: MoreItem[]; onPress: () => void }) {
  const look = useLook();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced || items.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), 1800);
    return () => clearInterval(t);
  }, [reduced, items.length]);
  const item = items[i % Math.max(1, items.length)];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`More: ${items.map((x) => x.label).join(", ")}`}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        // The stop card's other actions are 40 tall (StopAction): the same, so the row lines up.
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: look.tileEdge,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      {reduced || !item ? (
        <Symbol name="ellipsis" size={20} color={look.colors.text} />
      ) : (
        <Animated.View key={item.key} entering={ZoomIn.duration(260)} exiting={ZoomOut.duration(180)}>
          <ItemIcon item={item} size={21} color={look.colors.accent} />
        </Animated.View>
      )}
    </Pressable>
  );
}

/** What the button opens into, in place: each action as a round button with its name, and a way to fold it back. */
export function MoreRow({ items, onClose }: { items: MoreItem[]; onClose: () => void }) {
  const look = useLook();
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
      {items.map((item, n) => (
        <Animated.View key={item.key} entering={ZoomIn.delay(40 * n).duration(240)} style={{ flex: 1, alignItems: "center", gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => {
              void Haptics.selectionAsync();
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: item.danger ? "transparent" : look.tile,
              borderWidth: 1,
              borderColor: look.tileEdge,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            <ItemIcon item={item} size={20} color={item.danger ? look.colors.danger : look.colors.text} />
          </Pressable>
          <Body size={11} weight="600" tone="secondary" center numberOfLines={2}>
            {item.label}
          </Body>
        </Animated.View>
      ))}
      <View style={{ alignItems: "center", gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: look.primary,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Symbol name="xmark" size={16} weight="bold" color={look.onPrimary} />
        </Pressable>
        <Body size={11} weight="600" tone="secondary">
          Close
        </Body>
      </View>
    </Animated.View>
  );
}
