import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo-modules-core";
import { OCCASION_THEME } from "./planConstants";
import { stopTimes } from "./nightClock";
import type { Itinerary, PlanInputs } from "./types";
import type { PlanTonightProps } from "../widgets/PlanTonight";

type Activity = {
  update(props: PlanTonightProps, staleDate?: Date): Promise<void>;
  end(policy?: "default" | "immediate", props?: PlanTonightProps): Promise<void>;
};
type Factory = { start(props: PlanTonightProps, url?: string, staleDate?: Date): Activity; getInstances(): Activity[] };

/*
 * Live Activities, where the phone and the build allow them.
 *
 * Not waiting for a new build: expo-widgets puts a general Live Activity in
 * the widget extension of every build that has it (23 on), and the layout is
 * handed over at run time, the way the widget's is. So this ships as an
 * update. iOS 16.2 or later, and not when they are turned off in Settings,
 * which start() reports by throwing.
 */
let cached: Factory | null | undefined;
function factory(): Factory | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== "ios" || parseFloat(String(Platform.Version)) < 16.2) return cached;
  if (!requireOptionalNativeModule("ExpoWidgets")) return cached;
  try {
    cached = (require("../widgets/PlanTonight") as { default: Factory }).default;
  } catch {
    cached = null;
  }
  return cached;
}

export const liveActivitiesAvailable = (): boolean => factory() != null;

/** The night, as stored on the phone: enough to word the activity with no network. */
type Night = {
  slug: string;
  title: string;
  accent: string;
  accentDark: string;
  stops: { name: string; time: string; arrive: number; leave: number }[];
};

const KEY = "duro.liveActivity.night";

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** ActivityKit's 4 KB is for everything; a long name only needs to be recognisable. */
const trim = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The stops on the phone's clock (see nightClock), worded for the activity. */
function nightOf(slug: string, inputs: PlanInputs, itinerary: Itinerary): Night | null {
  const timed = stopTimes(inputs, itinerary);
  if (!timed) return null;
  const theme = OCCASION_THEME[inputs.occasion] ?? OCCASION_THEME.date_night;
  const stops = timed.map((s) => ({ name: trim(s.name), time: s.time, arrive: s.arrive, leave: s.leave }));
  return { slug, title: trim(itinerary.title, 40), accent: theme.accent, accentDark: theme.accentDark, stops };
}

/** What to show at `now`, or null once the night is over. */
function momentOf(n: Night, now: number): { props: PlanTonightProps; until: number } | null {
  const last = n.stops[n.stops.length - 1];
  if (now >= last.leave) return null;
  const schedule = n.stops.slice(0, 4).map((s) => ({ time: s.time.replace(/\s?[AP]M$/i, ""), name: s.name }));
  const base = { title: n.title, accent: n.accent, accentDark: n.accentDark, schedule };

  for (let i = 0; i < n.stops.length; i++) {
    const s = n.stops[i];
    const next = n.stops[i + 1];
    if (now < s.arrive) {
      // Before it: the first of the night, or on the way from the last one.
      const from = i === 0 ? Math.min(now, s.arrive - 60 * 60_000) : n.stops[i - 1].leave;
      return {
        until: s.arrive,
        props: {
          ...base,
          eyebrow: i === 0 ? `FIRST UP · ${s.time}` : `NEXT · ARRIVE ${s.time}`,
          name: s.name,
          line: next ? `then ${next.name} at ${next.time}` : "The last stop of the night",
          from,
          to: s.arrive,
          current: Math.min(i, 3),
        },
      };
    }
    if (now < s.leave) {
      return {
        until: s.leave,
        props: {
          ...base,
          eyebrow: "NOW",
          name: s.name,
          line: next ? `Leave at ${clock(s.leave)} for ${next.name}` : `Last stop, until ${clock(s.leave)}`,
          from: s.arrive,
          to: s.leave,
          current: Math.min(i, 3),
        },
      };
    }
  }
  return null;
}

/** Whether a plan is close enough to tonight to follow: from six hours before its first stop until its last ends. */
export function canFollow(slug: string | null, inputs: PlanInputs, itinerary: Itinerary): boolean {
  if (!slug || !liveActivitiesAvailable()) return false;
  const n = nightOf(slug, inputs, itinerary);
  if (!n) return false;
  const now = Date.now();
  return now >= n.stops[0].arrive - 6 * 3_600_000 && now < n.stops[n.stops.length - 1].leave;
}

export async function followingSlug(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Night).slug : null;
  } catch {
    return null;
  }
}

async function endAll(f: Factory) {
  for (const a of f.getInstances()) await a.end("immediate").catch(() => undefined);
}

/**
 * Put a plan on the Lock Screen. One night at a time: following another
 * replaces it. Resolves to a sentence for the toast.
 */
export async function follow(slug: string, inputs: PlanInputs, itinerary: Itinerary): Promise<string> {
  const f = factory();
  const n = nightOf(slug, inputs, itinerary);
  const m = n ? momentOf(n, Date.now()) : null;
  if (!f || !n || !m) return "This plan is over, so there is nothing to follow.";
  try {
    await endAll(f);
    f.start(m.props, `aduro://plan/${slug}`, new Date(m.until));
    await AsyncStorage.setItem(KEY, JSON.stringify(n));
    return "On your Lock Screen. It moves along each time you open Duro.";
  } catch {
    return "Live Activities are off for Duro. Turn them on in Settings, under Duro.";
  }
}

export async function unfollow(): Promise<void> {
  const f = factory();
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
  if (f) await endAll(f);
}

/**
 * Bring the activity up to the moment, or end it once the night is done.
 * Called when the app opens or comes back, and when a followed plan changes.
 */
export async function refreshLiveActivity(changed?: { slug: string; inputs: PlanInputs; itinerary: Itinerary }): Promise<void> {
  const f = factory();
  if (!f) return;
  let n: Night | null = null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    n = raw ? (JSON.parse(raw) as Night) : null;
  } catch {
    n = null;
  }
  if (!n) return;
  if (changed && changed.slug === n.slug) {
    n = nightOf(changed.slug, changed.inputs, changed.itinerary) ?? n;
    await AsyncStorage.setItem(KEY, JSON.stringify(n)).catch(() => undefined);
  }
  const running = f.getInstances();
  const m = momentOf(n, Date.now());
  if (!m) {
    await unfollow();
    return;
  }
  // Swiped away from the Lock Screen: they have said they are done with it.
  if (!running.length) {
    await AsyncStorage.removeItem(KEY).catch(() => undefined);
    return;
  }
  for (const a of running) await a.update(m.props, new Date(m.until)).catch(() => undefined);
}
