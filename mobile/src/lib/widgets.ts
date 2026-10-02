import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { listPlans } from "./data";
import { supabase } from "./supabase";
import { OCCASION_THEME } from "./planConstants";
import { WIDGET_MASCOTS } from "../widgets/mascots";
import type { SavedPlan } from "./types";
import type { NextPlanProps } from "../widgets/NextPlan";

type TimelineWidget = { updateTimeline(entries: { date: Date; props: NextPlanProps }[]): void };

/*
 * The widget, if this binary has widgets at all.
 *
 * expo-widgets arrived after the builds already on phones, and its module
 * asks for its native half the moment it is imported. So it is looked for
 * first, and on a build without it every call here quietly does nothing.
 */
let cached: TimelineWidget | null | undefined;
function nextPlanWidget(): TimelineWidget | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== "ios" || !requireOptionalNativeModule("ExpoWidgets")) return cached;
  try {
    cached = (require("../widgets/NextPlan") as { default: TimelineWidget }).default;
  } catch {
    cached = null;
  }
  return cached;
}

/** A plan's start and end on the phone's clock. */
function windowOf(p: SavedPlan): { start: Date; end: Date } | null {
  const [y, m, d] = (p.inputs.date ?? "").split("-").map(Number);
  const [h, mi] = (p.inputs.startTime ?? "19:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, h || 0, mi || 0);
  const end = new Date(start.getTime() + Math.max(1, Number(p.inputs.hours) || 4) * 3_600_000);
  return { start, end };
}

const midnight = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate());

/** How far off the plan is, as seen at moment `at`. */
function countdownAt(at: Date, start: Date, end: Date): string {
  if (at >= start && at < end) return "Now";
  const days = Math.round((midnight(start).getTime() - midnight(at).getTime()) / 86_400_000);
  if (days <= 0) return start.getHours() >= 17 ? "Tonight" : "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

const EMPTY: NextPlanProps = {
  empty: true,
  url: "aduro://plan/new",
  title: "",
  countdown: "",
  when: "",
  firstTime: "",
  firstName: "",
  stops: [],
  accent: OCCASION_THEME.date_night.accent,
  accentDark: OCCASION_THEME.date_night.accentDark,
  // Waving, with sparkles: an invitation rather than an empty box.
  mascot: WIDGET_MASCOTS.celebration ?? "",
};

/**
 * Bring the "Your next plan" widget up to date.
 *
 * The next saved plan that has not finished, worded for each day between now
 * and then, so the countdown turns from "In 3 days" to "Tomorrow" to
 * "Tonight" on its own at midnight, shows "Now" while it is on, and gives way
 * to "Plan your next outing" once it is over. Called when the app opens or
 * comes back, on signing in or out, and after a plan is saved, changed or
 * deleted.
 */
export async function refreshWidgets(): Promise<void> {
  const widget = nextPlanWidget();
  if (!widget) return;

  // Signed out, nobody's plan: the widget lives on the phone, not the account.
  let plans: SavedPlan[] = [];
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) plans = await listPlans();
  } catch {
    // Offline: the empty state is the honest answer.
  }

  const now = new Date();
  const upcoming = plans
    .map((p) => ({ p, w: windowOf(p) }))
    .filter((x): x is { p: SavedPlan; w: { start: Date; end: Date } } => Boolean(x.w && x.w.end > now))
    .sort((a, b) => a.w.start.getTime() - b.w.start.getTime())[0];

  if (!upcoming) {
    widget.updateTimeline([{ date: now, props: EMPTY }]);
    return;
  }

  const { p, w } = upcoming;
  const theme = OCCASION_THEME[p.inputs.occasion] ?? OCCASION_THEME.date_night;
  const stops = (p.itinerary.stops ?? []).slice(0, 3).map((s) => ({ time: s.arrival_time, name: s.name }));
  const base: Omit<NextPlanProps, "countdown"> = {
    empty: false,
    url: `aduro://plan/${p.share_slug}`,
    title: p.itinerary.title,
    when: w.start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    firstTime: stops[0]?.time ?? "",
    firstName: stops[0]?.name ?? "",
    stops,
    accent: theme.accent,
    accentDark: theme.accentDark,
    // In the occasion's costume, as on the app's own cards.
    mascot: WIDGET_MASCOTS[p.inputs.occasion] ?? WIDGET_MASCOTS.celebration ?? "",
  };

  // Now, every midnight until the day, the start, and the end.
  const moments: Date[] = [now];
  for (let t = new Date(midnight(now).getTime() + 86_400_000); t < w.start && moments.length < 31; t = new Date(t.getTime() + 86_400_000)) {
    moments.push(t);
  }
  if (w.start > now) moments.push(w.start);
  const entries = moments.map((at) => ({ date: at, props: { ...base, countdown: countdownAt(at, w.start, w.end) } }));
  entries.push({ date: w.end, props: EMPTY });

  try {
    widget.updateTimeline(entries);
  } catch {
    // A widget that cannot update keeps its last entry; never worth a crash.
  }
}
