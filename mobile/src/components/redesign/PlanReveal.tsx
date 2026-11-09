import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeInDown, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { Symbol } from "../Symbol";
import { GUTTER } from "../../theme";
import { useLook } from "../../lib/appearance";
import { useReducedMotion } from "../motion";
import { longDate } from "../../lib/format";
import type { Itinerary, PlanInputs } from "../../lib/types";
import { Body, Display, LookButton, LookScreen, RoundButton } from "../look";
import { forParty } from "./Questions";
import { Confetti } from "./Confetti";
import { RouteMap } from "./RouteMap";

const MAP_H = 260;

/**
 * The plan, revealed (owner, 2 Nov 2026): the route draws itself between the
 * stops, then the stops arrive as blocks, with the rides between them and
 * the total underneath. Everything that changes a plan, swapping a stop,
 * menus, getting there, pickups, lives on the full plan, a tap away.
 */
export function PlanReveal({
  itinerary,
  inputs,
  saving,
  saved,
  onSave,
  onOpenFull,
  onClose,
}: {
  itinerary: Itinerary;
  inputs: PlanInputs;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onOpenFull: () => void;
  onClose: () => void;
}) {
  const look = useLook();
  const c = look.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  // A handful of confetti the moment it is saved, not on every visit to a saved plan.
  const [fire, setFire] = useState(0);
  const wasSaved = useRef(saved);
  useEffect(() => {
    if (saved && !wasSaved.current) setFire((f) => f + 1);
    wasSaved.current = saved;
  }, [saved]);
  const blocks = [
    { bg: look.primary, fg: look.onPrimary },
    { bg: look.second, fg: look.onSecond },
    { bg: look.third, fg: look.onThird },
  ];
  const dotFill = (i: number) => blocks[i % blocks.length];

  return (
    <LookScreen band="none">
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: MAP_H + insets.top, paddingTop: insets.top, backgroundColor: look.id === "daylight" ? "#F3F4F6" : look.tile }}>
          <RouteMap itinerary={itinerary} height={MAP_H} />
          <View style={{ position: "absolute", left: GUTTER, top: insets.top + 8 }}>
            <RoundButton label="Close" onPress={onClose} filled>
              <Symbol name="xmark" size={16} weight="bold" color={look.onPrimary} />
            </RoundButton>
          </View>
        </View>

        <View style={{ paddingHorizontal: GUTTER, paddingTop: 20, gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Body size={14} weight="600" tone="secondary">
              {`${longDate(itinerary.date)} · ${forParty(inputs.partySize)}`}
            </Body>
            <Display size={32} weight="700">
              {itinerary.title}
            </Display>
          </View>

          {itinerary.notice || itinerary.budget_note ? (
            <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: look.tileEdge, padding: 12 }}>
              <Body size={14} tone="secondary">
                {itinerary.notice || itinerary.budget_note}
              </Body>
            </View>
          ) : null}

          {itinerary.stops.map((s, i) => {
            const b = blocks[i % blocks.length];
            const hop = itinerary.hops[i];
            return (
              <View key={`${s.venue_id}-${i}`} style={{ gap: 10 }}>
                <Animated.View entering={reduced ? undefined : FadeInDown.delay(900 + i * 160).duration(420)}>
                  <View style={{ borderRadius: 24, backgroundColor: b.bg, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", gap: 14, alignItems: "center" }}>
                    <Display size={20} weight="800" color={b.fg} style={{ width: 74 }}>
                      {s.arrival_time.replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase())}
                    </Display>
                    <View style={{ flex: 1 }}>
                      <Display size={18} weight="700" color={b.fg} numberOfLines={2}>
                        {s.name}
                      </Display>
                      <Body size={13} weight="500" color={b.fg} style={{ opacity: 0.85 }} numberOfLines={1}>
                        {[s.label ? s.label.charAt(0) + s.label.slice(1).toLowerCase() : null, s.area].filter(Boolean).join(" · ")}
                      </Body>
                    </View>
                    {s.est_cost_ghs > 0 ? (
                      <Body size={13} weight="700" color={b.fg}>
                        {`GHS ${Math.round(s.est_cost_ghs).toLocaleString()}`}
                      </Body>
                    ) : null}
                  </View>
                </Animated.View>
                {hop && i < itinerary.stops.length - 1 ? (
                  <Animated.View entering={reduced ? undefined : FadeInDown.delay(980 + i * 160).duration(380)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16 }}>
                    <Symbol name="car.fill" size={13} color={c.textSecondary} />
                    <Body size={12} weight="600" tone="secondary">
                      {`${hop.mins} min${inputs.driving ? " drive" : ` ride · about GHS ${Math.round(hop.cost_ghs)}`}`}
                    </Body>
                  </Animated.View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: GUTTER,
          paddingTop: 12,
          paddingBottom: insets.bottom + 10,
          backgroundColor: c.background,
          borderTopWidth: 1,
          borderTopColor: look.tileEdge,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body size={12} weight="600" tone="secondary">{`Total ${forParty(inputs.partySize)}`}</Body>
            <Display size={26} weight="800">{`GHS ${Math.round(itinerary.est_total_ghs).toLocaleString()}`}</Display>
          </View>
          <LookButton label="Full plan" kind="outline" onPress={onOpenFull} style={{ paddingHorizontal: 18 }} />
          <LookButton label={saved ? "Saved" : saving ? "Saving" : "Save"} onPress={onSave} disabled={saving || saved} style={{ paddingHorizontal: 22 }} />
        </View>
      </View>
      <Confetti fire={fire} />
    </LookScreen>
  );
}
