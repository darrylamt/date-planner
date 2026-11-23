import { KINDS } from "@/components/planner/nights";
import { VENUE_VIBE_TAGS } from "@/lib/catalog";
import { geminiJSON, type GeminiResult } from "@/lib/gemini";

/** Fastest first, each twice: a busy answer from Google rarely lasts. */
const POSTER_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"];

/**
 * An event poster read into the event form: what, when, where, how much.
 *
 * A poster is how almost every night in Accra is announced, and the form
 * asked for everything it already says. Read once, the form is filled and the
 * person corrects it rather than types it. Nothing here is saved: the form
 * shows every field, and the planner, venue or admin saves as before.
 *
 * Dates are resolved against today in Accra, because posters say "this
 * Friday" and "Sat 25th" and leave the year off.
 */
export type FlyerDraft = {
  isEvent: boolean;
  title: string;
  kind: string;
  otherKind: string;
  dates: string[];
  /** For a run (an exhibition, a season): the last day, YYYY-MM-DD, or "" for single nights. */
  runsUntil: string;
  time: string;
  endTime: string;
  venueName: string;
  area: string;
  costMode: "free" | "paid" | "unknown";
  cost: number;
  bookingUrl: string;
  phone: string;
  audience: "everyone" | "women" | "men";
  vibes: string[];
  description: string;
  dressCode: string;
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    isEvent: { type: "BOOLEAN" },
    title: { type: "STRING" },
    kind: { type: "STRING", enum: [...KINDS.map((k) => k.id), "other"] },
    otherKind: { type: "STRING" },
    dates: { type: "ARRAY", items: { type: "STRING" } },
    startDate: { type: "STRING" },
    endDate: { type: "STRING" },
    time: { type: "STRING" },
    endTime: { type: "STRING" },
    venueName: { type: "STRING" },
    area: { type: "STRING" },
    costMode: { type: "STRING", enum: ["free", "paid", "unknown"] },
    cost: { type: "NUMBER" },
    bookingUrl: { type: "STRING" },
    phone: { type: "STRING" },
    audience: { type: "STRING", enum: ["everyone", "women", "men"] },
    vibes: { type: "ARRAY", items: { type: "STRING", enum: [...VENUE_VIBE_TAGS] } },
    description: { type: "STRING" },
    dressCode: { type: "STRING" },
  },
  // startDate and endDate required too: optional fields are the ones the light models leave out.
  required: ["isEvent", "title", "kind", "dates", "startDate", "endDate", "time", "venueName", "costMode", "audience", "vibes", "description"],
};

function prompt(today: string): string {
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `This is a poster for an event in Accra, Ghana. Today is ${weekday} ${today}. Read it into these fields:
- isEvent: false if this is not an event poster at all (a menu, a selfie, a logo), and leave the rest empty.
- title: the event's own name as printed, in normal capitalisation (not ALL CAPS). Not the venue, not a slogan.
- kind: the closest of: ${KINDS.map((k) => `${k.id} (${k.label})`).join(", ")}; "other" with otherKind in two or three words if none fits.
- dates: for single nights, every date it happens, as YYYY-MM-DD. Posters leave out the year: use the next such date from today. "Every Friday" means the next four Fridays. Empty if no date is printed, and empty for a run (below).
- startDate and endDate: for something that runs over a period, an exhibition, a season, "on view until", "runs till", "continues until", two dates joined by a dash, give the first day and the last day as YYYY-MM-DD, even if the first day has passed. Read day-first dates as day-first: "14.11.2026" is 14 November, "31.10.26" is 31 October 2026. An exhibition's opening date is its startDate. endDate is "" when no last day is printed. Both "" for single nights.
- time: start time, 24-hour HH:MM ("8pm till late" is 20:00). endTime likewise, or "". For a run, time and endTime are its daily opening hours if printed ("open 10am-6pm"); an opening night or reception time is not the daily hours, so leave both "" then.
- venueName: the venue's name as printed. area: the neighbourhood if printed (Osu, East Legon, Labone...), else "".
- costMode and cost: "free" for free entry; "paid" with cost the cheapest price for one person to get in (early bird or regular, never a table or VIP package) in Ghana cedis; "unknown" if no price is printed.
- bookingUrl: a ticket link if printed (add https:// if missing), else "". phone: a contact number as printed, else "".
- audience: "women" for ladies-only nights, "men" for men only, else "everyone". "Ladies free before 10" is still everyone.
- vibes: up to three that the poster plainly shows, from the allowed list.
- description: two short sentences in plain English saying what the night is and what to expect, from the poster only. No hype, no emojis, no prices or dates.
- dressCode: if printed, else "".`;
}

/** A day later or earlier, as YYYY-MM-DD. */
const addDays = (isoDay: string, n: number) => new Date(Date.parse(`${isoDay}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** The same day a month on ("2026-10-31" becomes "2026-11-30"). */
function addMonth(isoDay: string): string {
  const [y, m, day] = isoDay.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), 12)).toISOString().slice(0, 10);
}
/** How far ahead a run is put on, one row a day; it can be extended later. */
const RUN_DAYS_AHEAD = 60;

/**
 * The days to put it on, from today.
 *
 * Single nights are the dates printed. A run, an exhibition above all, is
 * every day from its start (or today, when it has opened already) to its end;
 * an art show with no end printed is taken to run a month from its start
 * (owner, 23 Nov 2026). A run already over gives nothing.
 */
function datesOf(d: { kind?: string; dates?: string[]; startDate?: string; endDate?: string }, today: string): { dates: string[]; runsUntil: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const start = iso.test(d.startDate ?? "") ? d.startDate! : "";
  let end = iso.test(d.endDate ?? "") ? d.endDate! : "";
  if (start && !end && d.kind === "art_show") end = addMonth(start);
  if (start && end && end >= start) {
    const from = start > today ? start : today;
    const to = end < addDays(today, RUN_DAYS_AHEAD) ? end : addDays(today, RUN_DAYS_AHEAD);
    const days: string[] = [];
    for (let x = from; x <= to; x = addDays(x, 1)) days.push(x);
    return { dates: days, runsUntil: end };
  }
  const nights = [...new Set([...(d.dates ?? []), ...(start ? [start] : [])].filter((x) => iso.test(x) && x >= today))].sort();
  return { dates: nights.slice(0, 24), runsUntil: "" };
}

export async function readFlyer(image: { mime: string; data: Buffer }): Promise<GeminiResult<FlyerDraft>> {
  const today = new Date().toISOString().slice(0, 10); // Accra is UTC all year
  /*
   * The two fast models only, each tried twice (owner, 23 Nov 2026: seven
   * tries, two reads, and slow). Flash Lite reads a poster in two to five
   * seconds, but at busy times Google answers 503 "high demand"; the reader
   * then fell through to Gemma and full Flash, which were busier still or
   * ran past their timeout, and the read failed after fifty seconds. A busy
   * answer is usually gone a moment later, so the fast ones are asked again,
   * fifteen seconds at most each, with full Flash last if time is left.
   */
  const r = await geminiJSON<FlyerDraft & { startDate?: string; endDate?: string }>({
    parts: [{ inline: image }],
    prompt: prompt(today),
    schema: SCHEMA,
    models: POSTER_MODELS,
    timeoutMs: 15_000,
    deadlineMs: 52_000,
    retryPauseMs: 1_200,
  });
  if (!r.ok) return r;
  const d = r.data;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const draft: FlyerDraft = {
    isEvent: d.isEvent !== false,
    title: (d.title ?? "").trim().slice(0, 120),
    kind: KINDS.some((k) => k.id === d.kind) ? d.kind : "other",
    otherKind: (d.otherKind ?? "").trim().slice(0, 40),
    ...datesOf(d, today),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time ?? "") ? d.time : "",
    endTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(d.endTime ?? "") ? d.endTime : "",
    venueName: (d.venueName ?? "").trim().slice(0, 120),
    area: (d.area ?? "").trim().slice(0, 60),
    costMode: d.costMode === "free" || d.costMode === "paid" ? d.costMode : "unknown",
    cost: d.costMode === "paid" && Number(d.cost) > 0 ? Math.round(Number(d.cost)) : 0,
    bookingUrl: /^https?:\/\/\S+$/i.test(d.bookingUrl ?? "") ? d.bookingUrl : "",
    phone: (d.phone ?? "").trim().slice(0, 40),
    audience: d.audience === "women" || d.audience === "men" ? d.audience : "everyone",
    vibes: (d.vibes ?? []).filter((v) => (VENUE_VIBE_TAGS as readonly string[]).includes(v)).slice(0, 3),
    description: (d.description ?? "").trim().slice(0, 600),
    dressCode: (d.dressCode ?? "").trim().slice(0, 80),
  };
  return { ok: true, data: draft, model: r.model };
}
