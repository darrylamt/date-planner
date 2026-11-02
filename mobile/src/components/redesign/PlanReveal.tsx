import { useEffect, useMemo } from "react";
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

const AnimatedPath = Animated.createAnimatedComponent(Path);
const MAP_H = 260;

/**
 * Where the stops sit on the panel: their real positions, fitted to it, or
 * an easy diagonal when the plan has too few pins to place.
 */
function placeStops(it: Itinerary, w: number, h: number): { x: number; y: number }[] {
  const pad = 46;
  const pins = it.stops.map((s) => (s.lat != null && s.lng != null ? { lat: Number(s.lat), lng: Number(s.lng) } : null));
  const known = pins.filter((p): p is { lat: number; lng: number } => p != null);
  const n = it.stops.length;
  const fallback = (i: number) => ({
    x: pad + (n === 1 ? 0.5 : i / (n - 1)) * (w - pad * 2),
    y: h - pad - (n === 1 ? 0.5 : i / (n - 1)) * (h - pad * 2 - 30),
  });
  if (known.length < 2 || known.length !== n) return it.stops.map((_, i) => fallback(i));
  const lats = known.map((p) => p.lat);
  const lngs = known.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const spanLat = Math.max(maxLat - minLat, 0.004);
  const spanLng = Math.max(maxLng - minLng, 0.004);
  // One scale for both, so the route keeps its real shape.
  const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2 - 30) / spanLat);
  const ox = (w - spanLng * scale) / 2;
  const oy = (h + 30 - spanLat * scale) / 2;
  return apart(
    known.map((p) => ({ x: ox + (p.lng - minLng) * scale, y: oy + (maxLat - p.lat) * scale })),
    w,
    h
  );
}

/** Stops on the same street would hide each other: nudge them apart until every pin shows. */
function apart(pts: { x: number; y: number }[], w: number, h: number): { x: number; y: number }[] {
  const min = 34;
  const out = pts.map((p) => ({ ...p }));
  for (let round = 0; round < 24; round++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j].x - out[i].x;
        let dy = out[j].y - out[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d === 0) [dx, dy] = [1, 0];
        const push = (min - d) / 2 / Math.max(d, 1);
        out[i].x -= dx * push;
        out[i].y -= dy * push;
        out[j].x += dx * push;
        out[j].y += dy * push;
      }
    }
  }
  return out.map((p) => ({ x: Math.min(w - 20, Math.max(20, p.x)), y: Math.min(h - 20, Math.max(50, p.y)) }));
}

/** A smooth line through the points (Catmull-Rom as cubic Béziers), and roughly how long it is. */
function smoothPath(pts: { x: number; y: number }[]): { d: string; length: number } {
  if (pts.length < 2) return { d: "", length: 0 };
  let d = `M${pts[0].x} ${pts[0].y}`;
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    length += Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1.15;
  }
  return { d, length };
}

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
  const pts = useMemo(() => placeStops(itinerary, width, MAP_H), [itinerary, width]);
  const route = useMemo(() => smoothPath(pts), [pts]);

  const drawn = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      drawn.value = 1;
      return;
    }
    drawn.value = 0;
    drawn.value = withDelay(250, withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }));
  }, [itinerary, reduced, drawn]);
  const routeProps = useAnimatedProps(() => ({ strokeDashoffset: route.length * (1 - drawn.value) }));

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
          <Svg width={width} height={MAP_H}>
            {/* A few streets, for the feel of a map. */}
            <Path
              d={`M0 ${MAP_H * 0.8} L${width} ${MAP_H * 0.6} M0 ${MAP_H * 0.42} L${width} ${MAP_H * 0.52} M${width * 0.23} 0 L${width * 0.38} ${MAP_H} M${width * 0.66} 0 L${width * 0.59} ${MAP_H} M0 ${MAP_H * 0.15} L${width} ${MAP_H * 0.08}`}
              stroke={look.id === "daylight" ? "#E2E4E9" : c.text}
              strokeOpacity={look.id === "daylight" ? 1 : 0.07}
              strokeWidth={7}
              strokeLinecap="round"
              fill="none"
            />
            {route.d ? (
              <>
                <Path d={route.d} stroke={look.primary} strokeOpacity={0.22} strokeWidth={14} strokeLinecap="round" fill="none" />
                <AnimatedPath
                  d={route.d}
                  stroke={look.id === "daylight" ? c.accent : look.primary}
                  strokeWidth={4}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${route.length} ${route.length}`}
                  animatedProps={routeProps}
                />
              </>
            ) : null}
            {pts.map((p, i) => (
              <Circle key={`d${i}`} cx={p.x} cy={p.y} r={13} fill={dotFill(i).bg} stroke={look.colors.background} strokeWidth={2} />
            ))}
            {pts.map((p, i) => (
              <SvgText key={`n${i}`} x={p.x} y={p.y + 4.5} fontSize={13} fontWeight="700" fill={dotFill(i).fg} textAnchor="middle">
                {String(i + 1)}
              </SvgText>
            ))}
          </Svg>
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
    </LookScreen>
  );
}
