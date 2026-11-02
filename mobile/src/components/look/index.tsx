import { Pressable, StyleSheet, Text as RNText, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Ellipse, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useId, type ReactNode } from "react";
import { useLook } from "../../lib/appearance";
import { KENTE } from "../../lib/looks";

/*
 * The redesign's shared pieces, drawn from the look being worn (looks.ts), so
 * one screen serves Kente, Night and Daylight alike.
 */

/** Display type: the look's own face, large and tight. */
export function Display({
  children,
  size = 36,
  weight = "700",
  color,
  center,
  numberOfLines,
  style,
}: {
  children: ReactNode;
  size?: number;
  weight?: "600" | "700" | "800";
  color?: string;
  center?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const look = useLook();
  return (
    <RNText
      accessibilityRole="header"
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={1.25}
      style={[
        {
          fontFamily: look.display[weight],
          fontSize: size,
          lineHeight: Math.round(size * 1.05),
          letterSpacing: -size * 0.03,
          color: color ?? look.colors.text,
          textAlign: center ? "center" : undefined,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/** Body text in Figtree, coloured from the look. */
export function Body({
  children,
  size = 15,
  weight = "400",
  tone = "primary",
  color,
  center,
  numberOfLines,
  style,
}: {
  children: ReactNode;
  size?: number;
  weight?: "400" | "500" | "600" | "700";
  tone?: "primary" | "secondary" | "tertiary";
  color?: string;
  center?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const c = useLook().colors;
  const family = { "400": "Figtree_400Regular", "500": "Figtree_500Medium", "600": "Figtree_600SemiBold", "700": "Figtree_700Bold" }[weight];
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: family,
          fontSize: size,
          lineHeight: Math.round(size * 1.4),
          color: color ?? (tone === "primary" ? c.text : tone === "secondary" ? c.textSecondary : c.textTertiary),
          textAlign: center ? "center" : undefined,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/**
 * The woven band along the top of a Kente screen: gold, green and red on
 * black, with a checked row under it. Nothing in the other looks.
 */
export function KenteBand({ thin = false }: { thin?: boolean }) {
  const look = useLook();
  // Each band its own pattern names: on the web they are global to the page.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!look.band) return null;
  const top = thin ? 6 : 14;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={thin ? top : top + 12}>
        <Defs>
          <Pattern id={`weave${uid}`} x="0" y="0" width="54" height={top} patternUnits="userSpaceOnUse">
            <Rect x="0" y="0" width="22" height={top} fill={KENTE.gold} />
            <Rect x="22" y="0" width="4" height={top} fill={KENTE.black} />
            <Rect x="26" y="0" width="12" height={top} fill={KENTE.green} />
            <Rect x="38" y="0" width="4" height={top} fill={KENTE.black} />
            <Rect x="42" y="0" width="8" height={top} fill={KENTE.red} />
            <Rect x="50" y="0" width="4" height={top} fill={KENTE.black} />
          </Pattern>
          <Pattern id={`check${uid}`} x="0" y="0" width="12" height="8" patternUnits="userSpaceOnUse">
            <Rect x="0" y="0" width="6" height="8" fill={KENTE.black} />
            <Rect x="6" y="0" width="6" height="8" fill={KENTE.gold} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height={top} fill={`url(#weave${uid})`} />
        {thin ? null : (
          <>
            <Rect x="0" y={top} width="100%" height="8" fill={`url(#check${uid})`} />
            <Rect x="0" y={top + 8} width="100%" height="4" fill={KENTE.green} />
          </>
        )}
      </Svg>
    </View>
  );
}

/**
 * What sits behind a screen: plain black for Kente, white for Daylight, and
 * for Night a dusk sky with the last of the sun low on it.
 */
export function LookBackground() {
  const look = useLook();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!look.sky) return <View style={[StyleSheet.absoluteFill, { backgroundColor: look.colors.background }]} />;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#2E1D52", "#1B1336", "#0C0A16", "#08070E"]}
        locations={[0, 0.34, 0.64, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height={420} style={{ position: "absolute", top: 60 }}>
        <Defs>
          <RadialGradient id={`glow${uid}`} cx="50%" cy="100%" rx="60%" ry="60%">
            <Stop offset="0" stopColor="#FF9650" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#FF9650" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="300" rx="70%" ry="160" fill={`url(#glow${uid})`} />
      </Svg>
    </View>
  );
}

/** A screen in the new design: the look's background, and the band when it has one. */
export function LookScreen({ children, band = "full" }: { children: ReactNode; band?: "full" | "thin" | "none" }) {
  return (
    <View style={{ flex: 1 }}>
      <LookBackground />
      {band === "none" ? null : <KenteBand thin={band === "thin"} />}
      {children}
    </View>
  );
}

/** The big rounded button: primary, an outline, or the look's light colour. */
export function LookButton({
  label,
  sub,
  onPress,
  kind = "primary",
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  sub?: string;
  onPress: () => void;
  kind?: "primary" | "outline" | "light";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const look = useLook();
  const bg = kind === "primary" ? look.primary : kind === "light" ? look.third : "transparent";
  const fg = kind === "primary" ? look.onPrimary : kind === "light" ? look.onThird : look.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: sub ? 66 : 58,
          borderRadius: 33,
          backgroundColor: bg,
          borderWidth: kind === "outline" ? 1 : 0,
          borderColor: look.tileEdge,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <Body size={17} weight="700" color={fg}>
        {label}
      </Body>
      {sub ? (
        <Body size={13} weight="500" color={fg} style={{ opacity: 0.75 }}>
          {sub}
        </Body>
      ) : null}
    </Pressable>
  );
}

/** Progress woven in the look's colours: kente stripes, or the look's accent. */
export function WovenProgress({ value }: { value: number }) {
  const look = useLook();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const pct = `${Math.max(4, Math.min(100, Math.round(value * 100)))}%` as const;
  return (
    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: look.tile, overflow: "hidden" }}>
      {look.band ? (
        <Svg width={pct} height={8}>
          <Defs>
            <Pattern id={`progress${uid}`} x="0" y="0" width="17" height="8" patternUnits="userSpaceOnUse">
              <Rect x="0" y="0" width="10" height="8" fill={KENTE.gold} />
              <Rect x="10" y="0" width="4" height="8" fill={KENTE.green} />
              <Rect x="14" y="0" width="3" height="8" fill={KENTE.red} />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width="100%" height="8" fill={`url(#progress${uid})`} />
        </Svg>
      ) : (
        <View style={{ width: pct, height: 8, borderRadius: 4, backgroundColor: look.colors.accent }} />
      )}
    </View>
  );
}

/** A round icon button with a hairline edge: back, close and the like. */
export function RoundButton({
  children,
  onPress,
  label,
  filled = false,
  size = 44,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  filled?: boolean;
  size?: number;
}) {
  const look = useLook();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: filled ? 0 : 1,
        borderColor: look.tileEdge,
        backgroundColor: filled ? look.primary : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

/** A small answered-question chip, for the strip above each question. */
export function AnswerChip({ label }: { label: string }) {
  const look = useLook();
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: look.tile }}>
      <Body size={12} weight="600" tone="secondary" numberOfLines={1}>
        {label}
      </Body>
    </View>
  );
}
