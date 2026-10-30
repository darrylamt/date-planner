import type { Candidates } from "./matching";
import type { PlannedItinerary, PlannedStop } from "./planner";
import type { EventRow, ItineraryOrder, PlanInputs, Venue } from "./types";
import { estimateHop } from "./transport";
import { isOpenThroughout, parsePeriods, weekdayOf } from "./hours";
import { expandVibes } from "./catalog";
import { isDriving } from "./budget";

/*
 * A night of events, back to back, and nothing else unless asked
 * (PlanInputs.eventNight; owner, 30 Oct 2026: "i wanted the ai to plan a
 * night with events and it kept trying to add a dinner"). The ordinary
 * planner builds an evening of roles, a meal among them, and fits at most one
 * event in; this one strings the day's events together instead.
 *
 * Two kinds of event, because not every event needs you at the start: a film,
 * a class or a workshop does (a cake class, a pizza masterclass, yoga, a
 * trivia night), and a band, a party or mini golf you can walk into while it
 * is on. A fixed one is arrived at by its start, waiting if early; a drop-in
 * one any time in its window. Priced by its ticket, as an event always is;
 * one with no price on file is left out, never shown free.
 */

type Slot = {
  event: EventRow;
  venue: Venue;
  start: number;
  /** Arrive by the start (a film, a class) rather than any time while it is on. */
  fixed: boolean;
  /** The latest a drop-in can be arrived at. */
  latest: number;
  stay: number;
  score: number;
};

const FIXED_WORDS =
  /\b(class|classes|masterclass|workshop|session|screening|movie|film|yoga|pilates|trivia|quiz|tour|weaving|making|painting|lesson|tasting|bootcamp|run club|course|talk|seminar|bingo|game night)\b/i;
const FIXED_CATEGORIES = new Set(["movie", "film_night", "workshop", "wellness", "sports", "history", "festival"]);
const LONG_DROP_IN = new Set(["nightlife", "music", "other", "party"]);

function minutesOf(t: string | null | undefined): number | null {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** Whether an event has to be arrived at by its start, and how long it takes. */
export function eventTiming(e: Pick<EventRow, "title" | "category"> & { kind?: string; runtime_mins?: number | null }): {
  fixed: boolean;
  stay: number;
} {
  if (e.kind === "movie") return { fixed: true, stay: Math.round(Number(e.runtime_mins) || 120) + 20 };
  const fixed = FIXED_CATEGORIES.has(e.category) || FIXED_WORDS.test(e.title);
  if (fixed) return { fixed, stay: /\b(yoga|pilates)\b/i.test(e.title) ? 75 : 120 };
  return { fixed, stay: LONG_DROP_IN.has(e.category) ? 120 : 75 };
}

export function planEventNight(
  inputs: PlanInputs,
  candidates: Candidates,
  variety: (venueId: string) => number = () => 0,
  cars = 1
): (PlannedItinerary & { wanted: number }) | null {
  const planStart = minutesOf(inputs.startTime) ?? 18 * 60;
  const planEnd = planStart + Math.round(inputs.hours * 60);
  const weekday = weekdayOf(inputs.date);
  const wanted = Math.max(2, Math.min(5, inputs.stops ?? Math.round(inputs.hours / 1.75)));
  const driving = isDriving(inputs);
  const party = inputs.partySize;
  const tags = expandVibes(inputs.vibes);
  const byId = new Map(candidates.venues.map((v) => [v.id, v]));
  const audienceOk = (a: string | null | undefined) =>
    !a || a === "everyone" || (a === "women" && inputs.crew === "ladies") || (a === "men" && inputs.crew === "guys");

  const slots: Slot[] = [];
  for (const e of candidates.events) {
    const venue = e.venue_id ? byId.get(e.venue_id) : undefined;
    const start = minutesOf(e.start_time);
    if (!venue || start == null || e.cost_ghs == null || !audienceOk(e.audience)) continue;
    const { fixed, stay } = eventTiming(e as EventRow & { kind?: string; runtime_mins?: number | null });
    /*
     * How late a drop-in can be joined: a daytime listing that opens at noon
     * (mini golf, the zipline) runs on into the evening; a night out has a
     * few hours in it. Its venue's hours, where we have them, decide.
     */
    const latest = fixed ? start : start < 17 * 60 ? Math.max(start, 20 * 60 - stay) : start + 240 - stay;
    if ((fixed ? start : latest) < planStart || start + (fixed ? stay : 0) > planEnd + 60) continue;
    const eventTags = new Set([...((e as EventRow & { vibe_tags?: string[] }).vibe_tags ?? []), ...venue.vibe_tags].map((t) => t.toLowerCase()));
    const fit = tags.filter((t) => eventTags.has(t)).length;
    slots.push({
      event: e,
      venue,
      start,
      fixed,
      latest,
      stay,
      score:
        fit * 2 +
        // A night that happens once, ahead of a daily listing (one-off-events-first).
        (e.recurring ? 0 : 2) +
        (start >= 17 * 60 ? 1 : 0) +
        variety(venue.id),
    });
  }
  if (!slots.length) return null;

  const hop = (a: Venue | null, b: Venue) => (a ? estimateHop(a, b) : { mins: 0, cost_ghs: 0 });
  const fare = (cost: number) => (driving ? 0 : cost * Math.max(1, cars));

  /*
   * The best chain, searched rather than taken greedily: a good early event
   * can leave nothing after it. Each step keeps its eight best next events,
   * which is plenty for one city's evening and keeps the search small.
   */
  type Step = { slot: Slot; arrive: number };
  let best: { steps: Step[]; value: number; spend: number } | null = null;
  const visit = (steps: Step[], t: number, from: Venue | null, spend: number, value: number) => {
    if (steps.length && (!best || value > best.value)) best = { steps: [...steps], value, spend };
    if (steps.length >= wanted) return;
    const used = new Set(steps.map((s) => s.slot.venue.id));
    const titles = new Set(steps.map((s) => s.slot.event.title.toLowerCase()));
    const next = slots
      .filter((s) => !used.has(s.venue.id) && !titles.has(s.event.title.toLowerCase()))
      .map((s) => {
        const h = hop(from, s.venue);
        const ready = t + h.mins;
        const arrive = s.fixed ? Math.max(ready, s.start) : Math.max(ready, s.start);
        if (s.fixed ? ready > s.start : arrive > s.latest) return null;
        if (arrive + s.stay > planEnd + 30) return null;
        if (weekday !== null && !s.fixed) {
          const open = isOpenThroughout(parsePeriods(s.venue.opening_periods), weekday, arrive, s.stay);
          if (open === false) return null;
        }
        const cost = Math.round(Number(s.event.cost_ghs) * party) + fare(h.cost_ghs);
        // At a budget of nothing, only what is free.
        if (spend + cost > Math.max(0, inputs.budget)) return null;
        // Waiting about is a cost: a point for every half hour stood outside.
        const wait = Math.max(0, arrive - ready);
        return { s, arrive, cost, gain: s.score - wait / 30 - h.mins / 30 };
      })
      .filter((x): x is { s: Slot; arrive: number; cost: number; gain: number } => x !== null)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 8);
    for (const n of next) {
      steps.push({ slot: n.s, arrive: n.arrive });
      // Each stop is worth having in itself: a second event beats a better-scored first one alone.
      visit(steps, n.arrive + n.s.stay, n.s.venue, spend + n.cost, value + 5 + n.gain);
      steps.pop();
    }
  };
  // The night starts where its first event is; nothing before it is planned.
  visit([], planStart, null, 0, 0);
  const chosen = best as { steps: Step[]; value: number; spend: number } | null;
  if (!chosen) return null;

  const line = (s: Slot): ItineraryOrder => ({
    item: s.event.kind === "movie" ? "Ticket and snacks (estimate)" : Number(s.event.cost_ghs) > 0 ? "Entry" : "Entry, free",
    qty: party,
    price_ghs: Math.round(Number(s.event.cost_ghs) * party),
    door: true,
    note: s.fixed
      ? `Starts at ${clock(s.start)}, so be there for the start.`
      : `On from ${clock(s.start)}. Drop in any time while it is on.`,
  });
  const eventOf = (e: EventRow) => ({
    id: e.id,
    title: e.title,
    start_time: e.start_time,
    image_url: e.image_url ?? null,
    contact_phone: e.contact_phone ?? null,
    booking_url: e.booking_url ?? null,
    description: e.description ?? null,
    reservation_required: e.reservation_required ?? false,
    audience: e.audience ?? "everyone",
    organiser_name: e.organiser_name ?? null,
    organiser_logo_url: e.organiser_logo_url ?? null,
  });

  const steps = chosen.steps;
  const stops: PlannedStop[] = steps.map((st, i) => {
    const s = st.slot;
    const prev = steps[i - 1]?.slot.venue ?? null;
    const prevEnd = i > 0 ? steps[i - 1].arrive + steps[i - 1].slot.stay : planStart;
    const nextStep = steps[i + 1];
    const taken = new Set(steps.map((x) => x.slot.venue.id));
    // Swaps: other events this slot could hold without breaking the stop after it.
    const alternates = slots
      .filter((o) => !taken.has(o.venue.id))
      .filter((o) => {
        const ready = prevEnd + hop(prev, o.venue).mins;
        const arrive = Math.max(ready, o.start);
        if (o.fixed ? ready > o.start : arrive > o.latest) return false;
        if (!nextStep) return arrive + o.stay <= planEnd + 30;
        const onward = arrive + o.stay + hop(o.venue, nextStep.slot.venue).mins;
        return nextStep.slot.fixed ? onward <= nextStep.slot.start : onward <= nextStep.slot.latest;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((o) => ({
        venue: o.venue,
        orders: [line(o)],
        cost: Math.round(Number(o.event.cost_ghs) * party),
        charges: [],
        label: o.event.title,
        event: eventOf(o.event),
      }));
    return {
      venue: s.venue,
      role: "activity",
      fixtures: [],
      event: eventOf(s.event),
      label: s.event.title,
      durationMins: s.stay,
      arrivalMinutes: st.arrive,
      orders: [line(s)],
      cost: Math.round(Number(s.event.cost_ghs) * party),
      alternates,
      charges: [],
      tier: 0,
      basis: "door",
    };
  });

  const hops = stops.slice(0, -1).map((s, i) => {
    const est = estimateHop(s.venue, stops[i + 1].venue);
    return { from: s.venue.areas?.name ?? "", to: stops[i + 1].venue.areas?.name ?? "", mins: est.mins, cost_ghs: fare(est.cost_ghs) };
  });
  const foodTotal = stops.reduce((t, s) => t + s.cost, 0);
  const transportTotal = hops.reduce((t, h) => t + h.cost_ghs, 0);
  return {
    stops,
    hops,
    foodTotal,
    transportTotal,
    total: foodTotal + transportTotal,
    confidence: { exact: true, low: foodTotal + transportTotal, high: foodTotal + transportTotal, estimatedStops: [] },
    trimmed: stops.length < wanted,
    wanted,
  };
}
