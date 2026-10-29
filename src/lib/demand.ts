import { createHmac } from "node:crypto";
import { createServiceClient } from "./supabase/server";
import { defaultDate, focusesOf } from "./planConstants";
import { weekdayOf } from "./hours";
import type { GenerateResponse, PlanInputs } from "./types";

/** Budgets in bands, never the figure: enough to see who is asking, not who. */
export function budgetBand(ghs: number): string {
  if (ghs <= 0) return "free";
  if (ghs < 300) return "under 300";
  if (ghs < 600) return "300-600";
  if (ghs < 1000) return "600-1000";
  if (ghs < 2000) return "1000-2000";
  return "2000+";
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/** Who asked and on what, as the route can tell from the request (0097). */
export interface DemandMeta {
  /** The account when signed in, else the phone's random id (x-duro-device). */
  who: string | null;
  /** An admin or staff login: the team testing. */
  team: boolean;
  platform: "ios" | "android" | "web" | null;
  appVersion: string | null;
}

/**
 * A one-way key for whoever asked, so repeat planners can be counted without
 * knowing who they are: an HMAC of the account or phone id that cannot be
 * turned back into either.
 */
export function plannerKey(who: string | null): string | null {
  if (!who) return null;
  const secret = process.env.PLANNER_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return secret ? createHmac("sha256", secret).update(who).digest("hex").slice(0, 32) : null;
}

/** The planner's own starting answers that came through unchanged. */
function keptDefaults(inputs: PlanInputs): string[] {
  const kept: string[] = [];
  if (inputs.date === defaultDate()) kept.push("date");
  if (inputs.startTime === "17:30") kept.push("time");
  return kept;
}

/**
 * One anonymous row about a plan request. See migration 0065.
 *
 * No user, no account, and never the exact point: "near me" is rounded to a
 * square about 1.1 km on a side before it is written. Failures are swallowed,
 * because a plan must never fail over its own statistics.
 */
export async function recordDemand(inputs: PlanInputs, answer: GenerateResponse, meta?: DemandMeta): Promise<void> {
  if (answer.status === "error") return;
  try {
    const db = createServiceClient();
    const venueIds =
      answer.status === "ok"
        ? [...new Set(answer.itinerary.stops.map((s) => s.venue_id).filter((id): id is string => Boolean(id)))]
        : [];
    const reached = answer.status === "ok" && answer.reached ? answer.reached : null;
    const row = {
      plan_date: inputs.date,
      weekday: weekdayOf(inputs.date),
      start_minute: minutesOf(inputs.startTime),
      source: inputs.near ? "near" : inputs.surpriseMe || !inputs.areaIds.length ? "anywhere" : "areas",
      city: inputs.city ?? "Accra",
      area_ids: inputs.near || inputs.surpriseMe ? [] : inputs.areaIds,
      cell_lat: inputs.near ? Math.round(inputs.near.lat * 100) / 100 : null,
      cell_lng: inputs.near ? Math.round(inputs.near.lng * 100) / 100 : null,
      // How far the plan actually reached, which is wider than asked when it had to be.
      radius_km: reached?.km ?? inputs.radiusKm ?? null,
      occasion: inputs.occasion,
      party_size: inputs.partySize,
      budget_band: budgetBand(inputs.budget),
      focuses: focusesOf(inputs),
      vibes: inputs.vibes ?? [],
      cuisines: inputs.cuisines ?? [],
      /*
       * "reached" is demand the chosen areas could not meet on their own:
       * the plan worked, but only by borrowing from next door, which makes
       * it as much a reason to sign venues there as "nothing fitted".
       */
      outcome: answer.status === "no_match" ? "no_match" : reached ? "reached" : "ok",
      no_match_reason: answer.status === "no_match" ? answer.headline.slice(0, 200) : null,
      venue_ids: venueIds,
      // Which entry point started it (0085).
      ...(inputs.entry ? { entry: inputs.entry } : {}),
    };
    /*
     * What 0097 adds. Every dish and drink on the plan, by venue, so the
     * meals people are sent to are counted for every plan, not only saved ones.
     */
    const extra = {
      planner: plannerKey(meta?.who ?? null),
      team: meta?.team ?? false,
      est_total_ghs: answer.status === "ok" ? Math.round(Number(answer.itinerary.est_total_ghs) || 0) : null,
      platform: meta?.platform ?? null,
      app_version: meta?.appVersion ?? null,
      budget_chosen: inputs.budgetChosen ?? null,
      kept_defaults: keptDefaults(inputs),
      /*
       * Each stop's heading, arrival and kind of place go with its dishes, so
       * the meal report (/admin/meals, mealChecks.ts) can judge a plan as it
       * was served: lunch or dinner, a base eaten with a stew, a plate that
       * said to allow extra for drinks.
       */
      orders:
        answer.status === "ok"
          ? answer.itinerary.stops
              .filter((s) => s.venue_id && s.orders?.length)
              .map((s) => ({
                venue_id: s.venue_id,
                type: s.venue_type ?? null,
                label: s.label,
                at: s.arrival_time,
                dry: s.orders.some((o) => /allow extra for drinks/i.test(o.note ?? "")),
                items: s.orders.map((o) => ({
                  item: o.item,
                  qty: o.qty,
                  ghs: o.price_ghs,
                  ...(o.door ? { door: true } : {}),
                  ...(/^To eat with/.test(o.note ?? "") ? { base: true } : {}),
                  // No menu yet, so a guess: /admin/unpriced ranks whose menu to get first by these.
                  ...(o.estimate ? { estimate: true } : {}),
                })),
              }))
          : null,
    };
    // What they do not eat (0099); kept apart so a database before 0099 still takes the rest.
    const withDiet = inputs.diet?.length ? { ...extra, diet: inputs.diet } : extra;
    let first = await db.from("plan_demand").insert({ ...row, ...withDiet });
    // Before 0099 has run: without the diet. Before 0097: the row as it was.
    if (first.error && withDiet !== extra) first = await db.from("plan_demand").insert({ ...row, ...extra });
    const error = first.error ? (await db.from("plan_demand").insert(row)).error : null;
    if (error) {
      // Before 0069 the table knows only ok and no_match; before 0085 it has no entry.
      const { entry: _entry, ...withoutEntry } = row as typeof row & { entry?: string };
      void _entry;
      await db.from("plan_demand").insert({ ...withoutEntry, outcome: row.outcome === "reached" ? "ok" : row.outcome });
    }
  } catch {
    /* statistics are never worth a failed plan */
  }
}
