import { useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import type { SymbolViewProps } from "expo-symbols";
import { Symbol } from "../Symbol";
import { GUTTER } from "../../theme";
import { useLook } from "../../lib/appearance";
import { BUDGET_MAX, BUDGET_STEP } from "../../lib/budget";
import { PARTY_RULES, partySizeOptions, startTimeOptions, wantsDaylight, DAYTIME_START, DEFAULT_START_TIME } from "../../lib/planConstants";
import { time12 } from "../../lib/format";
import type { Occasion, PlanInputs } from "../../lib/types";
import { AnswerChip, Body, Display, LookButton, LookScreen, RoundButton, WovenProgress } from "../look";

/*
 * The redesigned questions (owner, 2 Nov 2026): every answer is something to
 * touch, not a chip. Each control here writes the same PlanInputs the old
 * steps did, so the planner behind them is unchanged.
 */

const WORDS = ["", "you", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** "for two", "for all six". */
export function forParty(n: number): string {
  if (n <= 1) return "for you";
  if (n === 2) return "for two";
  return `for ${n <= 12 ? WORDS[n] : n}`;
}

/* ── The shell every question sits in ─────────────────────────────────── */

export function QuestionShell({
  progress,
  label,
  onBack,
  onSkip,
  chips,
  title,
  subtitle,
  children,
  footer,
  scroll = true,
  scrollEnabled = true,
}: {
  progress: number;
  label: string;
  onBack: () => void;
  onSkip?: () => void;
  chips: string[];
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** Off while a dial, the sun or a loop is being dragged, so the page holds still. */
  scrollEnabled?: boolean;
}) {
  const look = useLook();
  const insets = useSafeAreaInsets();
  const body = (
    <View style={{ paddingHorizontal: GUTTER, gap: 16, paddingBottom: 24 }}>
      {chips.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {chips.map((c) => (
            <AnswerChip key={c} label={c} />
          ))}
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <Display size={36} weight="700">
          {title}
        </Display>
        {subtitle ? <Body tone="secondary">{subtitle}</Body> : null}
      </View>
      {children}
    </View>
  );
  return (
    <LookScreen band="thin">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingTop: look.band ? Math.max(insets.top - 6, 12) : insets.top + 8, paddingHorizontal: GUTTER, paddingBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <RoundButton label="Back" onPress={onBack}>
              <Symbol name="chevron.left" size={18} weight="semibold" color={look.colors.text} />
            </RoundButton>
            <WovenProgress value={progress} />
            {onSkip ? (
              <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={10} style={{ paddingHorizontal: 4, paddingVertical: 10 }}>
                <Body size={15} weight="600" color={look.colors.accent}>
                  Skip
                </Body>
              </Pressable>
            ) : (
              <Body size={13} weight="600" tone="secondary">
                {label}
              </Body>
            )}
          </View>
        </View>
        {scroll ? (
          <ScrollView
            scrollEnabled={scrollEnabled}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{body}</View>
        )}
        {footer ? <View style={{ paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: insets.bottom + 12 }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </LookScreen>
  );
}

/* ── Occasion: pick a card ────────────────────────────────────────────── */

const OCCASION_CARDS: { id: Occasion; label: string; icon: SymbolViewProps["name"] }[] = [
  { id: "date_night", label: "Date night", icon: "moon.stars.fill" },
  { id: "first_date", label: "First date", icon: "heart.fill" },
  { id: "friend_outing", label: "Friends out", icon: "person.3.fill" },
  { id: "birthday", label: "Birthday", icon: "birthday.cake.fill" },
  { id: "anniversary", label: "Anniversary", icon: "gift.fill" },
  { id: "solo_day", label: "A day to myself", icon: "sun.max" },
  { id: "family_day", label: "Family day", icon: "figure.and.child.holdinghands" },
  { id: "celebration", label: "Celebration", icon: "party.popper.fill" },
  { id: "graduation", label: "Graduation", icon: "graduationcap.fill" },
  { id: "business_meeting", label: "A meeting", icon: "building.2" },
];

export function occasionLabel(id: Occasion): string {
  return OCCASION_CARDS.find((o) => o.id === id)?.label ?? "Outing";
}

export function OccasionCards({ value, onPick }: { value: Occasion | null; onPick: (id: Occasion) => void }) {
  const look = useLook();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {OCCASION_CARDS.map((o) => {
        const on = value === o.id;
        const fg = on ? look.onPrimary : look.colors.text;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              void Haptics.selectionAsync();
              onPick(o.id);
            }}
            style={({ pressed }) => ({
              width: "48.4%",
              height: 98,
              borderRadius: 22,
              padding: 14,
              justifyContent: "space-between",
              backgroundColor: on ? look.primary : look.tile,
              borderWidth: on ? 0 : 1,
              borderColor: look.tileEdge,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Symbol name={o.icon} size={22} color={fg} />
            <Display size={17} weight="700" color={fg} numberOfLines={1}>
              {o.label}
            </Display>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── How many: a big number, and the group as people ─────────────────── */

export function PeopleCounter({ inputs, update }: { inputs: PlanInputs; update: (p: Partial<PlanInputs>) => void }) {
  const look = useLook();
  const rule = PARTY_RULES[inputs.occasion];
  const options = partySizeOptions(inputs.occasion);
  const n = rule.fixed ?? inputs.partySize;
  const min = options[0] ?? n;
  const max = options[options.length - 1] ?? n;
  const set = (next: number) => {
    if (next < min || next > max || next === n) return;
    void Haptics.selectionAsync();
    update({ partySize: next, companions: inputs.companions.slice(0, Math.max(0, next - 1)) });
  };
  const colours = [look.primary, look.second, look.id === "kente" ? "#C8372D" : look.colors.accent, look.third];
  const shown = Math.min(n, 8);
  return (
    <View style={{ gap: 22, marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <RoundButton label="One fewer" onPress={() => set(n - 1)} size={64}>
          <Symbol name="minus" size={22} weight="bold" color={n <= min ? look.colors.textTertiary : look.colors.text} />
        </RoundButton>
        <Display size={124} weight="800" center>
          {String(n)}
        </Display>
        <RoundButton label="One more" onPress={() => set(n + 1)} size={64} filled>
          <Symbol name="plus" size={22} weight="bold" color={look.onPrimary} />
        </RoundButton>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 10 }} accessibilityElementsHidden>
        {Array.from({ length: shown }, (_, i) => (
          <View key={i} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colours[i % colours.length], alignItems: "center", justifyContent: "center" }}>
            <Symbol name="person.fill" size={20} color={i % colours.length === 0 ? look.onPrimary : i % colours.length === 3 ? look.onThird : "#FFFFFF"} />
          </View>
        ))}
        {n > shown ? (
          <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: look.tileEdge, alignItems: "center", justifyContent: "center" }}>
            <Body size={14} weight="700">{`+${n - shown}`}</Body>
          </View>
        ) : null}
      </View>
      {rule.note ? (
        <Body tone="secondary" center>
          {rule.note}
        </Body>
      ) : null}
    </View>
  );
}

/* ── Budget: turn the dial ────────────────────────────────────────────── */

/** Finer at the low end, where most budgets are: the dial's turn is squared. */
const valueAt = (f: number) => Math.round((BUDGET_MAX * f * f) / BUDGET_STEP) * BUDGET_STEP;
const turnFor = (v: number) => Math.sqrt(Math.max(0, Math.min(BUDGET_MAX, v)) / BUDGET_MAX);

/** A rough sense of what the money buys, per head. Said as a guide, never a promise. */
function budgetHint(budget: number, party: number, driving: boolean): string {
  if (budget <= 0) return "Free places only.";
  const head = budget / Math.max(1, party);
  const rides = driving ? "" : ", rides included";
  if (head < 120) return `Street food or a café, and a stroll${rides}.`;
  if (head < 250) return `A casual dinner and one more stop${rides}.`;
  if (head < 450) return `Dinner, then a film or drinks${rides}.`;
  return `A full night out${rides}.`;
}

export function BudgetDial({
  inputs,
  update,
  onDragging,
}: {
  inputs: PlanInputs;
  update: (p: Partial<PlanInputs>) => void;
  onDragging?: (on: boolean) => void;
}) {
  const look = useLook();
  const size = 280;
  const stroke = 18;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const f = turnFor(inputs.budget);
  const last = useRef(f);
  const tick = useRef(Math.floor(inputs.budget / 250));

  const setFrom = (x: number, y: number) => {
    const dx = x - size / 2;
    const dy = y - size / 2;
    let a = Math.atan2(dx, -dy);
    if (a < 0) a += 2 * Math.PI;
    let next = a / (2 * Math.PI);
    // Past the top in one move is a wrap, not a jump: hold at the end it came from.
    if (Math.abs(next - last.current) > 0.5) next = last.current > 0.5 ? 1 : 0;
    last.current = next;
    const v = valueAt(next);
    const t = Math.floor(v / 250);
    if (t !== tick.current) {
      tick.current = t;
      void Haptics.selectionAsync();
    }
    if (v !== inputs.budget) update({ budget: v });
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      onDragging?.(true);
      last.current = turnFor(inputs.budget);
      setFrom(e.x, e.y);
    })
    .onUpdate((e) => setFrom(e.x, e.y))
    .onFinalize(() => onDragging?.(false));

  const a = f * 2 * Math.PI;
  const kx = size / 2 + r * Math.sin(a);
  const ky = size / 2 - r * Math.cos(a);
  const step = (d: number) => update({ budget: Math.max(0, Math.min(BUDGET_MAX, inputs.budget + d)) });

  return (
    <View style={{ alignItems: "center", gap: 16 }}>
      <GestureDetector gesture={pan}>
        <View
          style={{ width: size, height: size }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Budget"
          accessibilityValue={{ text: `GHS ${inputs.budget.toLocaleString()} ${forParty(inputs.partySize)}` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 100 : -100)}
        >
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={look.tile} strokeWidth={stroke} fill="none" />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={look.primary}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ * f} ${circ}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <Circle cx={kx} cy={ky} r={16} fill={look.colors.text} />
          </Svg>
          <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
            <Body size={14} weight="600" tone="secondary">
              GHS
            </Body>
            <Display size={60} weight="800">
              {inputs.budget.toLocaleString()}
            </Display>
            <Body size={14} weight="600" tone="secondary">
              {forParty(inputs.partySize)}
            </Body>
          </View>
        </View>
      </GestureDetector>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <RoundButton label="GHS 50 less" onPress={() => step(-BUDGET_STEP)}>
          <Symbol name="minus" size={16} weight="bold" color={look.colors.text} />
        </RoundButton>
        <RoundButton label="GHS 50 more" onPress={() => step(BUDGET_STEP)}>
          <Symbol name="plus" size={16} weight="bold" color={look.colors.text} />
        </RoundButton>
      </View>
      <View style={{ alignSelf: "stretch", borderRadius: 18, backgroundColor: look.tile, paddingVertical: 13, paddingHorizontal: 16 }}>
        <Body size={14}>{budgetHint(inputs.budget, inputs.partySize, Boolean(inputs.driving))}</Body>
      </View>
    </View>
  );
}

/* ── When: drag the sun ───────────────────────────────────────────────── */

const TIMES = startTimeOptions();
const SUN = require("../../../assets/3d/sun.png");
const MOON = require("../../../assets/3d/moon.png");

/** The sky behind the sun, by the hour: morning gold to night. */
function skyFor(hour: number, kente: boolean): [string, string, string] {
  if (kente) {
    if (hour < 11) return ["#6B5320", "#3A2C12", "#12100C"];
    if (hour < 16) return ["#7A5A18", "#3E2C10", "#12100C"];
    if (hour < 19) return ["#5A3A14", "#2A1C0D", "#12100C"];
    return ["#2A2015", "#1A150E", "#12100C"];
  }
  if (hour < 11) return ["#FFE9C2", "#FFD7A8", "#F7C6A3"];
  if (hour < 16) return ["#CFE8FF", "#E6F2FF", "#FFF4E0"];
  if (hour < 19) return ["#FFD9B0", "#FFB8A0", "#F59AA8"];
  return ["#2E1D52", "#1B1336", "#0C0A16"];
}

function momentFor(hour: number): string {
  if (hour < 11) return "Morning";
  if (hour < 16) return "Afternoon";
  if (hour < 18) return "Golden hour";
  if (hour < 20) return "Just after sunset";
  if (hour < 22) return "Evening";
  return "Late";
}

export function SunTime({
  value,
  onChange,
  onDragging,
}: {
  value: string;
  onChange: (t: string) => void;
  onDragging?: (on: boolean) => void;
}) {
  const look = useLook();
  const { width } = useWindowDimensions();
  const w = width - GUTTER * 2;
  const h = 230;
  const idx = Math.max(0, TIMES.indexOf(value));
  const t = idx / (TIMES.length - 1);
  const hour = Number(value.slice(0, 2));
  const night = hour >= 19 || hour < 6;
  const kente = look.id === "kente";
  const sky = skyFor(hour, kente);
  // The sun rides a low arc; after dark it is the moon.
  const sx = 24 + t * (w - 48);
  const sy = h - 40 - Math.sin(t * Math.PI) * (h - 90);
  const ink = kente || night ? "#F7F1E3" : "#0B0B0F";
  const lastIdx = useRef(idx);

  const setFrom = (x: number) => {
    const f = Math.max(0, Math.min(1, (x - 24) / (w - 48)));
    const i = Math.round(f * (TIMES.length - 1));
    if (i !== lastIdx.current) {
      lastIdx.current = i;
      void Haptics.selectionAsync();
      onChange(TIMES[i]);
    }
  };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      onDragging?.(true);
      setFrom(e.x);
    })
    .onUpdate((e) => setFrom(e.x))
    .onFinalize(() => onDragging?.(false));

  const nudge = (d: number) => {
    const i = Math.max(0, Math.min(TIMES.length - 1, idx + d));
    lastIdx.current = i;
    onChange(TIMES[i]);
  };

  return (
    <View style={{ gap: 14 }}>
      <GestureDetector gesture={pan}>
        <View
          style={{ width: w, height: h, borderRadius: 26, overflow: "hidden" }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Start time"
          accessibilityValue={{ text: time12(value) }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        >
          <LinearGradient colors={sky} style={{ position: "absolute", inset: 0 }} />
          <Svg width={w} height={h} style={{ position: "absolute" }}>
            <Path d={`M24 ${h - 40} Q ${w / 2} ${-h + 130} ${w - 24} ${h - 40}`} stroke={ink} strokeOpacity={0.25} strokeWidth={1.5} strokeDasharray="3 7" fill="none" />
            <Path d={`M0 ${h - 38} L${w} ${h - 38}`} stroke={ink} strokeOpacity={0.25} strokeWidth={1} />
            <Circle cx={sx} cy={sy} r={40} fill={night ? "#E8E4FF" : look.id === "daylight" ? "#FF7A3D" : "#F2C14E"} opacity={0.16} />
          </Svg>
          {/* The sun by day, the moon after seven: rendered in Blender (assets/3d). */}
          <Image
            source={night ? MOON : SUN}
            style={{ position: "absolute", left: sx - 28, top: sy - 28, width: 56, height: 56 }}
            contentFit="contain"
            pointerEvents="none"
          />
          <View style={{ position: "absolute", left: 20, bottom: 14 }} pointerEvents="none">
            <Display size={44} weight="800" color={ink}>
              {time12(value)}
            </Display>
            <Body size={14} weight="500" color={ink} style={{ opacity: 0.8 }}>
              {momentFor(hour)}
            </Body>
          </View>
        </View>
      </GestureDetector>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Body size={13} weight="500" tone="secondary">{time12(TIMES[0])}</Body>
        <Body size={13} weight="500" tone="secondary">Drag the sun</Body>
        <Body size={13} weight="500" tone="secondary">{time12(TIMES[TIMES.length - 1])}</Body>
      </View>
    </View>
  );
}

/* ── Vibe: this or that ───────────────────────────────────────────────── */

/**
 * Two at a time, three rounds: each card picked is a vibe kept, Both keeps
 * the pair, Neither keeps none (owner, 2 Nov 2026: "what if the person wants
 * both or neither?"). Three vibes at most, as the chips allowed, so the rounds
 * end once three are kept. The same vibes the chips offered.
 */
export function VibeDuel({
  options,
  inputs,
  update,
}: {
  options: string[];
  inputs: PlanInputs;
  update: (p: Partial<PlanInputs>) => void;
}) {
  const look = useLook();
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < options.length && pairs.length < 3; i += 2) pairs.push([options[i], options[i + 1]]);
  const [round, setRound] = useState(0);

  const pick = (labels: string[]) => {
    void Haptics.selectionAsync();
    let vibes = inputs.vibes;
    if (labels.length) {
      const vals = labels.map((l) => l.toLowerCase());
      vibes = [...inputs.vibes.filter((x) => !vals.includes(x)), ...vals].slice(0, 3);
      const daylight = wantsDaylight(vibes) && inputs.startTime === DEFAULT_START_TIME;
      update({ vibes, ...(daylight ? { startTime: DAYTIME_START } : {}) });
    }
    // Three is all the planner takes: the rounds stop there.
    setRound((r) => (vibes.length >= 3 ? pairs.length : r + 1));
  };

  if (round >= pairs.length) {
    return (
      <View style={{ gap: 12 }}>
        <Body tone="secondary">{inputs.vibes.length ? "The feel we'll go for:" : "No feel picked. We'll choose one that suits."}</Body>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {inputs.vibes.map((v) => (
            <View key={v} style={{ paddingHorizontal: 14, height: 38, borderRadius: 19, justifyContent: "center", backgroundColor: look.primary }}>
              <Body size={14} weight="700" color={look.onPrimary}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Body>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            update({ vibes: [] });
            setRound(0);
          }}
          style={{ alignSelf: "flex-start", paddingVertical: 8 }}
        >
          <Body size={15} weight="600" color={look.colors.accent}>
            Pick again
          </Body>
        </Pressable>
      </View>
    );
  }

  const [a, b] = pairs[round];
  const card = (label: string, bg: string, fg: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => pick([label])}
      style={({ pressed }) => ({
        height: 156,
        borderRadius: 30,
        backgroundColor: bg,
        padding: 20,
        justifyContent: "flex-end",
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Display size={30} weight="700" color={fg}>
        {label}
      </Display>
    </Pressable>
  );
  return (
    <View style={{ gap: 12 }}>
      <Body size={13} weight="600" tone="secondary">{`${round + 1} of ${pairs.length}`}</Body>
      <View>
        {card(a, look.primary, look.onPrimary)}
        {/* Between the two: both, or neither, either side of "or". */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 10 }}>
          <LookButton label="Both" kind="outline" onPress={() => pick([a, b])} style={{ flex: 1, minHeight: 46 }} accessibilityLabel={`Both: ${a} and ${b}`} />
          <Display size={16} weight="700" color={look.colors.textSecondary}>
            or
          </Display>
          <LookButton label="Neither" kind="outline" onPress={() => pick([])} style={{ flex: 1, minHeight: 46 }} accessibilityLabel={`Neither ${a} nor ${b}`} />
        </View>
        {card(b, look.second, look.onSecond)}
      </View>
    </View>
  );
}

/* ── That's enough to plan ────────────────────────────────────────────── */

export function EnoughToPlan({
  rows,
  optionalCount,
  onBuild,
  onMore,
  onBack,
}: {
  rows: { label: string; value: string }[];
  optionalCount: number;
  onBuild: () => void;
  onMore: () => void;
  onBack: () => void;
}) {
  const look = useLook();
  const insets = useSafeAreaInsets();
  return (
    <LookScreen band="full">
      <View style={{ flex: 1, paddingTop: look.band ? 20 : insets.top + 12, paddingHorizontal: GUTTER, gap: 18 }}>
        <RoundButton label="Back" onPress={onBack}>
          <Symbol name="chevron.left" size={18} weight="semibold" color={look.colors.text} />
        </RoundButton>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: look.second, alignItems: "center", justifyContent: "center" }}>
          <Symbol name="checkmark" size={24} weight="bold" color={look.onSecond} />
        </View>
        <Display size={40} weight="700">
          That's enough to plan.
        </Display>
        <View style={{ borderRadius: 24, backgroundColor: look.tile, paddingHorizontal: 18, paddingVertical: 4 }}>
          {rows.map((r, i) => (
            <View
              key={r.label}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                paddingVertical: 12,
                borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                borderBottomColor: look.tileEdge,
              }}
            >
              <Body size={15} weight="500" tone="secondary">
                {r.label}
              </Body>
              <Body size={15} weight="600" style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
                {r.value}
              </Body>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 12, gap: 10 }}>
        <LookButton label="Build my plan now" onPress={onBuild} />
        {optionalCount > 0 ? (
          <LookButton
            kind="outline"
            label="Make it more ours"
            sub={`${optionalCount} quick question${optionalCount === 1 ? "" : "s"}, all optional`}
            onPress={onMore}
          />
        ) : null}
      </View>
    </LookScreen>
  );
}
