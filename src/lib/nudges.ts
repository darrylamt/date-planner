import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPush, tokensForUsers, type PushMessage } from "./pushServer";

/**
 * Nudges, so people remember the app is there (owner, 30 Oct 2026): what's
 * on this weekend (Fridays), what's new this week (Tuesdays), and "it's been
 * a while" (Wednesdays). Sent from /api/cron/nudges at 15:00, which is 3pm in
 * Accra all year.
 *
 * Only to people who turned them on (notification_prefs, 0100), and never
 * more than one every 60 hours: at most two a week, Tuesday and Friday, and
 * the Wednesday one only when Tuesday had nothing new to say. Nobody with a
 * saved plan in the next three days is nudged; their reminder is coming.
 *
 * Each opens a new plan for the day it is about (startPlan.ts asks before
 * replacing a plan in progress), and the plan log counts what came of it by
 * its entry: push_weekend, push_new, push_lapsed.
 */
export type NudgeKind = "weekend" | "new" | "lapsed";
export interface Nudge {
  kind: NudgeKind;
  period: string;
  title: string;
  body: string;
  url: string;
}

const DAY_MS = 86_400_000;
const CAP_HOURS = 60;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "7pm", "7:30pm". */
function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
const minutesOf = (t: string | null | undefined) => {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** "HH:MM", an hour and a half before something starts, so there is time to eat first. */
const startBefore = (minute: number) => {
  const at = Math.max(10 * 60, minute - 90);
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
};
/*
 * A name as it reads in a message: no "untitled 04:" a listing came with, no
 * "(main branch)", and a name typed in capitals in ordinary case.
 */
export function tidyName(raw: string): string {
  let t = raw.replace(/^untitled\s*\d*\s*[:\-–]\s*/i, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > 3 && t === t.toUpperCase() && /[A-Z]/.test(t)) {
    t = t.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  }
  return t.slice(0, 70);
}

const planUrl = (entry: string, extra: Record<string, string> = {}) =>
  `/plan/new?fresh=1&from=${entry}${Object.entries(extra)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join("")}`;

/** The Friday, Saturday and Sunday of this week's weekend, from a given day. */
export function weekendOf(now: Date): string[] {
  const back = (now.getUTCDay() + 2) % 7; // days since Friday
  const friday = back <= 2 ? addDays(now, -back) : addDays(now, 7 - back);
  return [0, 1, 2].map((n) => iso(addDays(friday, n)));
}

type Candidate = { score: number; title: string; body: string; url: string };

/**
 * The one thing worth a weekend: a one-off event first (one-off-events-first),
 * then a weekly fixture, then a film that has just opened. Tonight wins a tie,
 * since it goes out on Friday afternoon. Null when there is nothing to say.
 */
export async function weekendNudge(db: SupabaseClient, now: Date): Promise<Nudge | null> {
  const days = weekendOf(now);
  const today = iso(now);
  const live = days.filter((d) => d >= today);
  if (!live.length) return null;
  const dayWord = (d: string) => (d === today ? "tonight" : `on ${DAY_NAMES[new Date(`${d}T12:00:00Z`).getUTCDay()]}`);
  const candidates: Candidate[] = [];

  // Events, with how many dates each title runs on nearby: three or more is a daily or weekly listing, not an occasion.
  const { data: evRows } = await db
    .from("events")
    .select("title, event_date, start_time, category, audience, venue_id, venues(name)")
    .eq("is_active", true)
    .gte("event_date", iso(addDays(now, -7)))
    .lte("event_date", iso(addDays(now, 14)));
  const events = (evRows ?? []) as unknown as {
    title: string;
    event_date: string;
    start_time: string | null;
    category: string | null;
    audience: string | null;
    venue_id: string | null;
    venues: { name: string } | null;
  }[];
  const runs = new Map<string, Set<string>>();
  for (const e of events) {
    const k = e.title.trim().toLowerCase();
    if (!runs.has(k)) runs.set(k, new Set());
    runs.get(k)!.add(e.event_date);
  }
  const LIVELY = new Set(["music", "comedy", "nightlife", "party", "quiz", "festival", "food", "film"]);
  for (const e of events) {
    if (!live.includes(e.event_date) || !e.venues?.name || (e.audience && e.audience !== "everyone")) continue;
    const at = minutesOf(e.start_time);
    const oneOff = (runs.get(e.title.trim().toLowerCase())?.size ?? 0) <= 2;
    const evening = at != null && at >= 17 * 60;
    const title = tidyName(e.title);
    candidates.push({
      score: (oneOff ? 4 : 0) + (evening ? 2 : 0) + (LIVELY.has(String(e.category)) ? 1 : 0) + (e.event_date === today ? 1 : 0),
      title: e.event_date === today ? "Tonight in Accra" : "This weekend in Accra",
      body: `${title} is on ${dayWord(e.event_date)} at ${tidyName(e.venues.name)}${at != null ? `, from ${clock(at)}` : ""}. Want an evening planned around it?`,
      url: planUrl("push_weekend", { date: e.event_date, ...(at != null ? { start: startBefore(at) } : {}) }),
    });
  }

  // Weekly fixtures on these days: a quiz, a band, karaoke.
  const { data: fixRows } = await db
    .from("venue_schedules")
    .select("title, weekday, starts_minute, audience, venues(name, is_active)")
    .eq("is_active", true);
  for (const f of (fixRows ?? []) as unknown as {
    title: string;
    weekday: number;
    starts_minute: number;
    audience: string | null;
    venues: { name: string; is_active: boolean } | null;
  }[]) {
    const day = live.find((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === f.weekday);
    if (!day || !f.venues?.is_active || (f.audience && f.audience !== "everyone")) continue;
    const evening = f.starts_minute >= 17 * 60;
    candidates.push({
      score: 2 + (evening ? 2 : 0) + (day === today ? 1 : 0),
      title: day === today ? "Tonight in Accra" : "This weekend in Accra",
      body: `Been to ${tidyName(f.title)} at ${tidyName(f.venues.name)}? It's on ${dayWord(day)} from ${clock(f.starts_minute)}. We can plan the rest of the night.`,
      url: planUrl("push_weekend", { date: day, start: startBefore(f.starts_minute) }),
    });
  }

  // A film that opened in the last fortnight and is showing this weekend.
  const { data: filmRows } = await db
    .from("cinema_showtimes")
    .select("title, cinema_name, show_date, release_date")
    .eq("is_active", true)
    .in("show_date", live)
    .gte("release_date", iso(addDays(now, -14)));
  const films = new Map<string, { title: string; cinema: string; day: string }>();
  for (const f of (filmRows ?? []) as { title: string; cinema_name: string | null; show_date: string }[]) {
    if (!films.has(f.title)) films.set(f.title, { title: f.title, cinema: f.cinema_name || "Silverbird", day: f.show_date });
  }
  for (const f of films.values()) {
    candidates.push({
      score: 3,
      title: "Showing this weekend",
      body: `${f.title} is showing at ${f.cinema} this weekend. Make a night of it?`,
      url: planUrl("push_weekend", { date: live.includes(days[1]) ? days[1] : f.day, start: "17:30" }),
    });
  }

  if (!candidates.length) return null;
  // Equal scores take turns by week, so the same fixture does not win every Friday.
  const week = Math.floor(now.getTime() / (7 * DAY_MS));
  const best = Math.max(...candidates.map((c) => c.score));
  const top = candidates.filter((c) => c.score === best);
  const pick = top[week % top.length];
  return { kind: "weekend", period: days[0], ...pick };
}

/** New on Duro this week: places added in the last seven days, and films just opened. */
export async function newThisWeekNudge(db: SupabaseClient, now: Date): Promise<Nudge | null> {
  const since = addDays(now, -7).toISOString();
  const { data: venueRows } = await db
    .from("venues")
    .select("name, type")
    .eq("is_active", true)
    .neq("type", "stay")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  const places = ((venueRows ?? []) as { name: string }[]).map((v) => tidyName(v.name));
  const { data: filmRows } = await db
    .from("cinema_showtimes")
    .select("title")
    .eq("is_active", true)
    .gte("show_date", iso(now))
    .gte("release_date", iso(addDays(now, -7)))
    .lte("release_date", iso(addDays(now, 3)));
  const films = [...new Set(((filmRows ?? []) as { title: string }[]).map((f) => f.title))];
  if (!places.length && !films.length) return null;

  const placesLine =
    places.length === 0
      ? ""
      : places.length === 1
        ? places[0]
        : places.length === 2
          ? `${places[0]} and ${places[1]}`
          : `${places[0]}, ${places[1]} and ${places.length - 2} more places`;
  const filmLine = films.length ? `${films[0]}${films.length > 1 ? ` and ${films.length - 1} more films` : ""} at the cinema` : "";
  const body = placesLine && filmLine
    ? `${placesLine}, plus ${filmLine}. Plan something new?`
    : placesLine
      ? `${placesLine}. Plan something new?`
      : `${filmLine} this week. Make a night of it?`;
  const monday = addDays(now, -((now.getUTCDay() + 6) % 7));
  return { kind: "new", period: iso(monday), title: "New on Duro this week", body, url: planUrl("push_new") };
}

const LAPSED_LINE: Record<string, { occasion: string; what: string }> = {
  date_night: { occasion: "date_night", what: "a date night" },
  first_date: { occasion: "date_night", what: "a date night" },
  anniversary: { occasion: "date_night", what: "a date night" },
  friend_outing: { occasion: "friend_outing", what: "a night out with friends" },
  birthday: { occasion: "friend_outing", what: "a night out with friends" },
  family_day: { occasion: "family_day", what: "a family day out" },
  solo_day: { occasion: "solo_day", what: "a day to yourself" },
};

/** "It's been a while", in the words of what they usually plan. */
export function lapsedNudge(usualOccasion: string | null, now: Date): Nudge {
  const line = (usualOccasion && LAPSED_LINE[usualOccasion]) || { occasion: "date_night", what: "an evening out" };
  return {
    kind: "lapsed",
    period: iso(now),
    title: "Free this weekend?",
    body: `It's been a while. Want ${line.what} planned for this weekend? Tell us the budget and we'll do the rest.`,
    url: planUrl("push_lapsed", { occasion: line.occasion }),
  };
}

export interface NudgeRun {
  kinds: NudgeKind[];
  optedIn: number;
  messages: { userId: string; nudge: Nudge }[];
  skipped: Record<string, number>;
  sent?: number;
  failures?: string[];
}

/**
 * Who gets what today. `dry` claims and sends nothing; `everyone` (dry only)
 * looks past the opt-in, to read what people would get.
 */
export async function runNudges(
  db: SupabaseClient,
  now: Date,
  opts: { kinds?: NudgeKind[]; dry?: boolean; everyone?: boolean } = {}
): Promise<NudgeRun> {
  const weekday = now.getUTCDay();
  const kinds: NudgeKind[] =
    opts.kinds ?? (weekday === 5 ? ["weekend"] : weekday === 2 ? ["new"] : weekday === 3 ? ["lapsed"] : []);
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const run: NudgeRun = { kinds, optedIn: 0, messages: [], skipped };
  if (!kinds.length) return run;

  // Who: opted in (or, previewing, anyone with a phone to send to).
  let userIds: string[];
  if (opts.everyone && opts.dry) {
    const { data } = await db.from("push_tokens").select("user_id");
    userIds = [...new Set(((data ?? []) as { user_id: string }[]).map((t) => t.user_id))];
  } else {
    const { data, error } = await db.from("notification_prefs").select("user_id").eq("nudges", true);
    if (error) return { ...run, skipped: { "notification_prefs missing (run 0100)": 1 } };
    userIds = ((data ?? []) as { user_id: string }[]).map((p) => p.user_id);
  }
  run.optedIn = userIds.length;
  if (!userIds.length) return run;

  const tokens = await tokensForUsers(db, userIds);
  const { data: recentRows } = await db
    .from("nudge_sends")
    .select("user_id, kind, sent_at")
    .in("user_id", userIds)
    .gte("sent_at", new Date(now.getTime() - 28 * DAY_MS).toISOString());
  const recent = (recentRows ?? []) as { user_id: string; kind: string; sent_at: string }[];
  const { data: planRows } = await db
    .from("plans")
    .select("user_id, created_at, plan_date, occasion")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(5000);
  const plans = (planRows ?? []) as { user_id: string; created_at: string; plan_date: string | null; occasion: string | null }[];
  const { data: profileRows } = await db.from("profiles").select("id, created_at").in("id", userIds);
  const joined = new Map(((profileRows ?? []) as { id: string; created_at: string }[]).map((p) => [p.id, Date.parse(p.created_at)]));

  const content = new Map<NudgeKind, Nudge | null>();
  if (kinds.includes("weekend")) content.set("weekend", await weekendNudge(db, now));
  if (kinds.includes("new")) content.set("new", await newThisWeekNudge(db, now));

  const today = iso(now);
  const soon = iso(addDays(now, 3));
  for (const userId of userIds) {
    if (!(tokens.get(userId) ?? []).length) {
      skip("no device");
      continue;
    }
    const mine = recent.filter((r) => r.user_id === userId);
    if (mine.some((r) => now.getTime() - Date.parse(r.sent_at) < CAP_HOURS * 3_600_000)) {
      skip("nudged in the last 60 hours");
      continue;
    }
    const theirs = plans.filter((p) => p.user_id === userId);
    if (theirs.some((p) => p.plan_date && p.plan_date >= today && p.plan_date <= soon)) {
      skip("a plan in the next three days");
      continue;
    }
    let nudge: Nudge | null = null;
    for (const kind of kinds) {
      if (kind === "lapsed") {
        const last = theirs[0] ? Date.parse(theirs[0].created_at) : null;
        const since = last ?? joined.get(userId) ?? now.getTime();
        if (now.getTime() - since < (last ? 14 : 7) * DAY_MS) continue;
        if (mine.some((r) => r.kind === "lapsed")) continue; // once in 28 days
        const counts = new Map<string, number>();
        for (const p of theirs) if (p.occasion) counts.set(p.occasion, (counts.get(p.occasion) ?? 0) + 1);
        const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        nudge = lapsedNudge(usual, now);
      } else {
        nudge = content.get(kind) ?? null;
      }
      if (nudge) break;
    }
    if (!nudge) {
      skip("nothing to say");
      continue;
    }
    run.messages.push({ userId, nudge });
  }

  if (opts.dry) return run;

  // Claimed first: a send we are unsure about is skipped, never repeated.
  const out: PushMessage[] = [];
  const claimed: { userId: string; nudge: Nudge; devices: number }[] = [];
  for (const { userId, nudge } of run.messages) {
    const { error } = await db.from("nudge_sends").insert({
      user_id: userId,
      kind: nudge.kind,
      period: nudge.period,
      title: nudge.title,
      body: nudge.body,
      url: nudge.url,
    });
    if (error) {
      skip("already sent this period");
      continue;
    }
    const devices = tokens.get(userId) ?? [];
    for (const to of devices) out.push({ to, title: nudge.title, body: nudge.body, data: { url: nudge.url } });
    claimed.push({ userId, nudge, devices: devices.length });
  }
  const { sent, failures } = await sendExpoPush(out);
  for (const c of claimed) {
    await db.from("nudge_sends").update({ delivered: c.devices }).eq("user_id", c.userId).eq("kind", c.nudge.kind).eq("period", c.nudge.period);
  }
  return { ...run, sent, failures };
}
