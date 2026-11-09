import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Symbol } from "../Symbol";
import { useLook } from "../../lib/appearance";
import { useReducedMotion } from "../motion";
import { Body, Display, LookButton } from "../look";

/**
 * A card with a back (owner, 3 Nov 2026: "when they click reserve it should
 * flip the whole card around and give the text and options there"). The
 * front sets the size; the back fills it.
 */
export function FlipCard({ flipped, front, back }: { flipped: boolean; front: ReactNode; back: ReactNode }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withTiming(flipped ? 180 : 0, { duration: reduced ? 1 : 560, easing: Easing.inOut(Easing.cubic) });
  }, [flipped, reduced, turn]);
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1400 }, { rotateY: `${turn.value}deg` }],
    opacity: turn.value > 90 ? 0 : 1,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1400 }, { rotateY: `${turn.value - 180}deg` }],
    opacity: turn.value > 90 ? 1 : 0,
  }));
  return (
    <View>
      <Animated.View style={[{ backfaceVisibility: "hidden" }, frontStyle]} pointerEvents={flipped ? "none" : "auto"}>
        {front}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: "hidden" }, backStyle]} pointerEvents={flipped ? "auto" : "none"}>
        {back}
      </Animated.View>
    </View>
  );
}

export type ReserveChannel = { text: string; open: () => void };

/**
 * The back of a stop's card when Reserve is tapped: who, when, how to reach
 * them, and the warning about deposits, with a way to turn it back over.
 */
export function ReserveBack({
  venue,
  when,
  who,
  channels,
  mapListing,
  onClose,
}: {
  venue: string;
  when: string;
  who: string;
  channels: ReserveChannel[];
  mapListing?: (() => void) | null;
  onClose: () => void;
}) {
  const look = useLook();
  const c = look.colors;
  return (
    <View style={{ flex: 1, borderRadius: 24, backgroundColor: look.id === "daylight" ? "#F5F5F7" : c.backgroundElement, borderWidth: 1, borderColor: look.tileEdge, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Body size={13} weight="700" color={c.accent}>
            {channels.length ? "Request a table" : "No way to book this one yet"}
          </Body>
          <Display size={24} weight="700" numberOfLines={2}>
            {venue}
          </Display>
          <Body size={14} tone="secondary">{`${when} · for ${who}`}</Body>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not yet, turn the card back"
          onPress={() => {
            void Haptics.selectionAsync();
            onClose();
          }}
          hitSlop={8}
          style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: look.tileEdge, alignItems: "center", justifyContent: "center" }}
        >
          <Symbol name="arrow.uturn.backward" size={16} color={c.text} />
        </Pressable>
      </View>

      {channels.length ? (
        <>
          <Body size={14} tone="secondary">
            Choose how to reach them. We keep a note of the request either way.
          </Body>
          <View style={{ gap: 8 }}>
            {channels.map((ch, i) => (
              <LookButton key={ch.text} label={ch.text} kind={i === 0 ? "primary" : "outline"} onPress={ch.open} style={{ minHeight: 50 }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <Symbol name="exclamationmark.triangle" size={14} color={c.textSecondary} />
            <Body size={12} tone="secondary" style={{ flex: 1 }}>
              Never pay a deposit or send money over a phone call. If a deposit is needed, pay it on the venue's own booking page.
            </Body>
          </View>
        </>
      ) : (
        <>
          <Body size={14} tone="secondary">
            We have no booking page, number or Instagram for them. Most places like it take walk-ins, and the map listing sometimes has a number we don't.
          </Body>
          {mapListing ? <LookButton label="Open the map listing" onPress={mapListing} /> : null}
        </>
      )}
      <View style={{ flex: 1 }} />
      <LookButton label="Not yet" kind="outline" onPress={onClose} style={{ minHeight: 46 }} />
    </View>
  );
}
