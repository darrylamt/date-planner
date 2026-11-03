import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { Sprite } from "./Sprite";
import * as Haptics from "expo-haptics";
import type { SymbolViewProps } from "expo-symbols";
import { Symbol } from "../Symbol";
import { DayCalendar } from "../plan/DayCalendar";
import { GUTTER } from "../../theme";
import { useLook } from "../../lib/appearance";
import { KENTE } from "../../lib/looks";
import { FOCUS_OPTIONS, asksFocus, focusesOf } from "../../lib/planConstants";
import { loadingLines } from "../../lib/mascotLines";
import { useReducedMotion } from "../motion";
import type { Area, PlanFocus, PlanInputs } from "../../lib/types";
import { AnswerChip, Body, Display, KenteBand, LookBackground, RoundButton } from "../look";

/* Stage 2 of the redesigned questions (owner, 2 Nov 2026). */

/* ── Where: circle it on the map ──────────────────────────────────────── */

const MAX_AREAS = 4;
type Pt = { x: number; y: number };

/** Whether a point is inside a drawn loop (ray casting). */
function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * The city's areas as dots at their real middles (/api/areas). Draw a loop
 * round some to choose them, or tap one. Up to four, as the list allows; a
 * loop round more keeps the four nearest its middle. The list underneath
 * does the same, for anyone who would rather read names.
 */
export function AreaMap({
  areas,
  inputs,
  city,
  update,
  onDragging,
}: {
  areas: Area[];
  inputs: PlanInputs;
  city: string;
  update: (p: Partial<PlanInputs>) => void;
  onDragging?: (on: boolean) => void;
}) {
  const look = useLook();
  const c = look.colors;
  const { width } = useWindowDimensions();
  const w = width - GUTTER * 2;
  const h = 300;
  const pad = 22;
  const [loop, setLoop] = useState<Pt[]>([]);
  // The loop as it is drawn; state only paints it.
  const drawn = useRef<Pt[]>([]);

  const placed = useMemo(() => {
    const here = areas.filter((a) => (a.city || "Accra") === city && a.lat != null && a.lng != null);
    if (here.length < 3) return [];
    /*
     * Framed on the city's core, not its far corners: Aburi up in the hills
     * would otherwise squeeze every other area into one. The few outside the
     * frame sit on its edge, still there to tap.
     */
    const q = (xs: number[], f: number) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.round(f * (s.length - 1))];
    };
    const lats = here.map((a) => a.lat!);
    const lngs = here.map((a) => a.lng!);
    const [lo, hi] = [0.06, 0.94];
    const spanLat0 = q(lats, hi) - q(lats, lo);
    const spanLng0 = q(lngs, hi) - q(lngs, lo);
    const minLat = q(lats, lo) - spanLat0 * 0.12;
    const maxLat = q(lats, hi) + spanLat0 * 0.12;
    const minLng = q(lngs, lo) - spanLng0 * 0.12;
    const maxLng = q(lngs, hi) + spanLng0 * 0.12;
    const scale = Math.min((w - pad * 2) / Math.max(maxLng - minLng, 0.01), (h - pad * 2) / Math.max(maxLat - minLat, 0.01));
    const ox = (w - (maxLng - minLng) * scale) / 2;
    const oy = (h - (maxLat - minLat) * scale) / 2;
    const clamp = (v: number, max: number) => Math.min(max - pad / 2, Math.max(pad / 2, v));
    return here.map((a) => ({
      area: a,
      x: clamp(ox + (a.lng! - minLng) * scale, w),
      y: clamp(oy + (maxLat - a.lat!) * scale, h),
    }));
  }, [areas, city, w]);

  if (!placed.length) return null;

  const choose = (ids: string[]) => {
    void Haptics.selectionAsync();
    update({
      areaIds: ids,
      areaNames: areas.filter((x) => ids.includes(x.id)).map((x) => x.name),
      city,
      surpriseMe: false,
      near: undefined,
    });
  };

  const finishLoop = (pts: Pt[]) => {
    if (pts.length < 8) return;
    const within = placed.filter((p) => inside(p, pts));
    if (!within.length) return;
    const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
    const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
    const nearest = within
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
      .slice(0, MAX_AREAS)
      .map((p) => p.area.id);
    choose(nearest);
  };

  const tapAt = (x: number, y: number) => {
    const near = placed
      .map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > 26) return;
    const id = near.p.area.id;
    const on = inputs.areaIds.includes(id);
    choose(on ? inputs.areaIds.filter((x) => x !== id) : [...inputs.areaIds, id].slice(-MAX_AREAS));
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(6)
    .onBegin(() => onDragging?.(true))
    .onStart((e) => {
      drawn.current = [{ x: e.x, y: e.y }];
      setLoop(drawn.current);
    })
    .onUpdate((e) => {
      drawn.current = [...drawn.current, { x: e.x, y: e.y }];
      setLoop(drawn.current);
    })
    .onEnd(() => finishLoop(drawn.current))
    .onFinalize(() => onDragging?.(false));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => tapAt(e.x, e.y));

  const loopPath = loop.length > 1 ? `M${loop.map((p) => `${p.x} ${p.y}`).join(" L")} Z` : "";
  const chosen = new Set(inputs.areaIds);

  return (
    <View style={{ gap: 8 }}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View
          style={{ width: w, height: h, borderRadius: 26, overflow: "hidden", backgroundColor: look.id === "daylight" ? "#F3F4F6" : look.tile }}
          accessibilityLabel="Map of areas. Circle some to choose them, or use the list below."
        >
          <Svg width={w} height={h}>
            {loopPath ? (
              <Path d={loopPath} fill={look.primary} fillOpacity={0.12} stroke={look.primary} strokeWidth={2.5} strokeDasharray="8 7" strokeLinejoin="round" />
            ) : null}
            {placed.map((p) =>
              chosen.has(p.area.id) ? null : (
                <Circle key={p.area.id} cx={p.x} cy={p.y} r={4.5} fill={c.text} fillOpacity={0.45} />
              )
            )}
            {placed
              .filter((p) => chosen.has(p.area.id))
              .map((p) => (
                <Circle key={`on${p.area.id}`} cx={p.x} cy={p.y} r={9} fill={look.primary} stroke={look.colors.background} strokeWidth={2} />
              ))}
            {placed
              .filter((p) => chosen.has(p.area.id))
              .map((p) => (
                <SvgText
                  key={`t${p.area.id}`}
                  x={Math.min(w - 8, Math.max(8, p.x))}
                  y={p.y - 15}
                  fontSize={13}
                  fontWeight="700"
                  fill={c.text}
                  textAnchor={p.x < 60 ? "start" : p.x > w - 60 ? "end" : "middle"}
                >
                  {p.area.name}
                </SvgText>
              ))}
          </Svg>
        </View>
      </GestureDetector>
      <Body size={13} tone="secondary" center>
        Circle an area with your finger, or tap a dot. Up to four.
      </Body>
    </View>
  );
}

/* ── Which day: a week of tiles ───────────────────────────────────────── */

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayPicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const look = useLook();
  const [more, setMore] = useState(false);
  const days = useMemo(() => {
    const out: Date[] = [];
    const t = new Date();
    for (let i = 0; i < 7; i++) out.push(new Date(t.getFullYear(), t.getMonth(), t.getDate() + i));
    return out;
  }, []);
  const inWeek = days.some((d) => isoOf(d) === value);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {days.map((d, i) => {
          const iso = isoOf(d);
          const on = iso === value;
          const fg = on ? look.onPrimary : look.colors.text;
          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={i === 0 ? "Today" : d.toDateString()}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(iso);
              }}
              style={({ pressed }) => ({
                width: "23%",
                height: 88,
                borderRadius: 20,
                backgroundColor: on ? look.primary : look.tile,
                borderWidth: on ? 0 : 1,
                borderColor: look.tileEdge,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Body size={13} weight="600" color={fg} style={{ opacity: on ? 0.85 : 0.7 }}>
                {i === 0 ? "Today" : i === 1 ? "Tmrw" : DOW[d.getDay()]}
              </Body>
              <Display size={28} weight="800" color={fg}>
                {String(d.getDate())}
              </Display>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore((m) => !m)}
          style={({ pressed }) => ({
            width: "23%",
            height: 88,
            borderRadius: 20,
            backgroundColor: !inWeek ? look.primary : "transparent",
            borderWidth: 1,
            borderColor: look.tileEdge,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Symbol name="calendar" size={20} color={!inWeek ? look.onPrimary : look.colors.text} />
          <Body size={12} weight="600" color={!inWeek ? look.onPrimary : look.colors.text}>
            Later
          </Body>
        </Pressable>
      </View>
      {more || !inWeek ? (
        <View style={{ marginHorizontal: -GUTTER }}>
          <DayCalendar value={value} min={isoOf(new Date())} onChange={onChange} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Shape the night ──────────────────────────────────────────────────── */

const FOCUS_ICONS: Record<PlanFocus, SymbolViewProps["name"]> = {
  everything: "sparkles",
  food: "fork.knife",
  drinks: "wineglass",
  activities: "figure.bowling",
};

/**
 * How many places, and what the night is made of. The planner takes up to
 * two kinds of place and a count, not an order, so that is what is asked:
 * nothing here promises a sequence the plan would not keep.
 */
export function ShapeNight({ inputs, update }: { inputs: PlanInputs; update: (p: Partial<PlanInputs>) => void }) {
  const look = useLook();
  const n = inputs.stops ?? 0;
  const setStops = (next: number) => {
    if (next < 0 || next > 5) return;
    void Haptics.selectionAsync();
    update({ stops: next || undefined });
  };
  const chosen = focusesOf(inputs);
  const slotColours = [look.primary, look.second, look.third, look.primary, look.second];
  const slotText = [look.onPrimary, look.onSecond, look.onThird, look.onPrimary, look.onSecond];

  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Display size={20} weight="700">
            How many places?
          </Display>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <RoundButton label="One fewer place" onPress={() => setStops(n - 1)}>
              <Symbol name="minus" size={16} weight="bold" color={look.colors.text} />
            </RoundButton>
            <RoundButton label="One more place" onPress={() => setStops(n + 1)} filled>
              <Symbol name="plus" size={16} weight="bold" color={look.onPrimary} />
            </RoundButton>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityLabel={n ? `${n} places` : "Up to you"} accessible>
          {n === 0 ? (
            <View style={{ flex: 1, height: 64, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: look.tileEdge, alignItems: "center", justifyContent: "center" }}>
              <Body size={15} weight="600" tone="secondary">
                Up to you: we fit it to your time
              </Body>
            </View>
          ) : (
            Array.from({ length: n }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 64, borderRadius: 18, backgroundColor: slotColours[i], alignItems: "center", justifyContent: "center" }}>
                <Display size={22} weight="800" color={slotText[i]}>
                  {String(i + 1)}
                </Display>
              </View>
            ))
          )}
        </View>
      </View>

      {!inputs.eventNight && asksFocus(inputs.occasion) ? (
        <View style={{ gap: 12 }}>
          <Display size={20} weight="700">
            Made of
          </Display>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {FOCUS_OPTIONS.map((f) => {
              const on = f.id === "everything" ? chosen.length === 0 : chosen.includes(f.id);
              const fg = on ? look.onPrimary : look.colors.text;
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${f.title}. ${f.sub}`}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    if (f.id === "everything") return update({ focus: "everything", focuses: [] });
                    const next = on ? chosen.filter((x) => x !== f.id) : [...chosen, f.id].slice(-2);
                    update({ focuses: next, focus: next[0] ?? "everything" });
                  }}
                  style={({ pressed }) => ({
                    width: "48.4%",
                    minHeight: 104,
                    borderRadius: 22,
                    padding: 14,
                    justifyContent: "space-between",
                    backgroundColor: on ? look.primary : look.tile,
                    borderWidth: on ? 0 : 1,
                    borderColor: look.tileEdge,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <Symbol name={FOCUS_ICONS[f.id]} size={20} color={fg} />
                  <View>
                    <Display size={16} weight="700" color={fg}>
                      {f.title}
                    </Display>
                    <Body size={12} weight="500" color={fg} style={{ opacity: 0.8 }} numberOfLines={2}>
                      {f.sub}
                    </Body>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Body size={13} tone="secondary">
            Up to two.
          </Body>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: Boolean(inputs.eventNight) }}
        onPress={() => {
          void Haptics.selectionAsync();
          update({ eventNight: !inputs.eventNight });
        }}
        style={({ pressed }) => ({
          borderRadius: 22,
          padding: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          backgroundColor: inputs.eventNight ? look.second : "transparent",
          borderWidth: inputs.eventNight ? 0 : 1,
          borderColor: look.tileEdge,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Symbol name="ticket" size={22} color={inputs.eventNight ? look.onSecond : look.colors.text} />
        <View style={{ flex: 1 }}>
          <Display size={17} weight="700" color={inputs.eventNight ? look.onSecond : look.colors.text}>
            Only events, back to back
          </Display>
          <Body size={13} color={inputs.eventNight ? look.onSecond : look.colors.textSecondary}>
            Shows, classes, films and parties. No dinner added.
          </Body>
        </View>
      </Pressable>
    </View>
  );
}

/* ── Building the plan ────────────────────────────────────────────────── */

const RING_KENTE = require("../../../assets/3d/ring-kente-sheet.png");
const RING_GOLD = require("../../../assets/3d/ring-gold-sheet.png");

/**
 * While the planner works: the answers it is working from, a woven strip
 * running along a track, and what it is doing, in turn.
 */
export function BuildingNight({ inputs, chips }: { inputs: PlanInputs; chips: string[] }) {
  const look = useLook();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const lines = useMemo(() => loadingLines(inputs), [inputs]);
  const [line, setLine] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setLine((i) => (i + 1) % Math.max(1, lines.length)), 2200);
    return () => clearInterval(t);
  }, [lines.length]);

  return (
    <View style={{ flex: 1 }}>
      <LookBackground />
      <KenteBand />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 40, gap: 22 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => (
            <AnswerChip key={c} label={c} />
          ))}
        </View>
        {/* A ring that turns while the planner works: kente in Kente, gold otherwise (Blender, assets/3d). */}
        <View style={{ alignSelf: "center" }}>
          <Sprite source={look.band ? RING_KENTE : RING_GOLD} size={150} />
        </View>
        <Display size={40} weight="700">
          Putting your night together
        </Display>
        <Body size={16} tone="secondary" style={{ minHeight: 48 }}>
          {lines[line] ?? "Checking what's open, and what fits the budget."}
        </Body>
      </View>
    </View>
  );
}
