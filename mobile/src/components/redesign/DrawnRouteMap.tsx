import { useEffect, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { useLook } from "../../lib/appearance";
import { useReducedMotion } from "../motion";
import type { Itinerary } from "../../lib/types";
import { stopColours } from "./stopColours";

/*
 * The plan's route on a map: the stops numbered in the look's colours and
 * the line between them drawing itself. The drawn map: Android and the web
 * use it (RouteMap.tsx), and the real one (RouteMap.ios.tsx) falls back to it.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);

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

export function DrawnRouteMap({ itinerary, height }: { itinerary: Itinerary; height: number }) {
  const look = useLook();
  const c = look.colors;
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const pts = useMemo(() => placeStops(itinerary, width, height), [itinerary, width, height]);
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
  const fill = stopColours(look);

  return (
    <View style={{ width, height, backgroundColor: look.id === "daylight" ? "#F3F4F6" : look.tile }}>
      <Svg width={width} height={height}>
        {/* A few streets, for the feel of a map. */}
        <Path
          d={`M0 ${height * 0.8} L${width} ${height * 0.6} M0 ${height * 0.42} L${width} ${height * 0.52} M${width * 0.23} 0 L${width * 0.38} ${height} M${width * 0.66} 0 L${width * 0.59} ${height} M0 ${height * 0.15} L${width} ${height * 0.08}`}
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
          <Circle key={`d${i}`} cx={p.x} cy={p.y} r={13} fill={fill[i % fill.length].bg} stroke={look.colors.background} strokeWidth={2} />
        ))}
        {pts.map((p, i) => (
          <SvgText key={`n${i}`} x={p.x} y={p.y + 4.5} fontSize={13} fontWeight="700" fill={fill[i % fill.length].fg} textAnchor="middle">
            {String(i + 1)}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
