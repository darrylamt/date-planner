import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./fetchAll";

/**
 * Each venue's pull: whether people keep it once a plan shows it to them.
 *
 * Read from plan_signals (0089), the record of what people do with the
 * places in their plans, and written nightly to venue_pull (0091), where the
 * planner reads one number per venue: points added to its score.
 *
 * ── what counts ───────────────────────────────────────────────────────────
 *   kept     saved or shared in a plan                       1
 *            Book or Get there tapped                         ½
 *            menu, details, Maps or Instagram opened          ¼
 *   swapped  swapped out of a plan                            1
 * Shown and left alone counts for nothing either way: most plans are looked
 * at and closed, and that says nothing about any one stop.
 *
 * ── what keeps it honest ──────────────────────────────────────────────────
 * - Each thing counts once per plan (or per device per day, for taps that
 *   are not tied to a plan), so opening a menu five times is one opening.
 * - One device adds at most two to a venue's kept and two to its swapped:
 *   one person regenerating a plan all evening cannot sink or lift a place.
 * - Older signals count less: half at a month, nothing after three.
 * - The rate is pulled towards the average while there is little to go on
 *   (six signals' worth of the average are added to every venue), so two
 *   swaps on a quiet week do not bury anyone.
 * - Nobody leans at all until the catalogue has thirty kept-or-swapped
 *   between them. Before that the average is a guess, and swaps arrive before
 *   saves do: the first 22 signals were ten swaps and no saves, which would
 *   have marked every swapped venue down for being first.
 *
 * ── what it is worth ──────────────────────────────────────────────────────
 * At most two points either way, against three for a single vibe tag and
 * six for a named cuisine. Pull decides between places that fit equally
 * well; it never outvotes what somebody asked for.
 *
 * Plus up to ¾ of a point for a venue hardly shown yet, fading as it is
 * shown, so a new place gets the chance to earn a pull rather than starting
 * behind the ones that already have one.
 */
export const PULL = {
  windowDays: 90,
  halfLifeDays: 30,
  /** Signals' worth of the average added to every venue. */
  prior: 6,
  /** Points per unit of rate above or below the average. */
  scale: 4,
  cap: 2,
  /** Kept plus swapped, across every venue, before anyone leans. */
  minTotal: 30,
  /** Most one device can add to a venue's kept, and to its swapped. */
  perDevice: 2,
  exploreBelow: 8,
  exploreMax: 0.75,
} as const;

export interface Signal {
  device_id: string;
  venue_id: string;
  kind: string;
  plan_key: string | null;
  created_at: string;
  value: number | null;
}

export interface PullRow {
  venue_id: string;
  shown: number;
  kept: number;
  swapped: number;
  engaged: number;
  views: number;
  dwell_ms: number | null;
  rate: number | null;
  confidence: number;
  effect: number;
}

const KEPT: Record<string, number> = { saved: 1, shared: 1, book_tapped: 0.5, directions_tapped: 0.5 };
const ENGAGED: Record<string, number> = { menu_opened: 0.25, details_opened: 0.25, maps_opened: 0.25, instagram_opened: 0.25 };

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function computePull(signals: Signal[], venueIds: string[], now = Date.now()): { rows: PullRow[]; average: number } {
  const seen = new Set<string>();
  type Acc = { shown: number; kept: number; swapped: number; engaged: number; views: number; dwell: number[] };
  const acc = new Map<string, Acc>();
  /** Per device per venue, before the cap. */
  const dev = new Map<string, { kept: number; swapped: number }>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { shown: 0, kept: 0, swapped: 0, engaged: 0, views: 0, dwell: [] }));
    return a;
  };

  for (const s of signals) {
    const t = Date.parse(s.created_at);
    const age = (now - t) / 864e5;
    if (!Number.isFinite(age) || age < -1 || age > PULL.windowDays) continue;
    const w = 0.5 ** (Math.max(0, age) / PULL.halfLifeDays);
    const day = s.created_at.slice(0, 10);
    // A plan's own key where there is one; otherwise this device on this day.
    const unit = s.plan_key ?? `${s.device_id}:${day}`;
    const once = `${s.kind}|${unit}|${s.venue_id}`;
    if (s.kind !== "venue_viewed") {
      if (seen.has(once)) continue;
      seen.add(once);
    }

    const a = get(s.venue_id);
    const dk = `${s.device_id}|${s.venue_id}`;
    const d = dev.get(dk) ?? { kept: 0, swapped: 0 };
    dev.set(dk, d);

    if (s.kind === "shown") a.shown += w;
    else if (s.kind === "swapped_away") d.swapped += w;
    else if (KEPT[s.kind]) d.kept += KEPT[s.kind] * w;
    else if (ENGAGED[s.kind]) {
      d.kept += ENGAGED[s.kind] * w;
      a.engaged += w;
    } else if (s.kind === "venue_viewed") {
      a.views += 1;
      if (s.value != null) a.dwell.push(s.value);
    }
  }

  for (const [dk, d] of dev) {
    const a = get(dk.split("|")[1]);
    a.kept += Math.min(PULL.perDevice, d.kept);
    a.swapped += Math.min(PULL.perDevice, d.swapped);
  }

  let good = 0;
  let bad = 0;
  for (const a of acc.values()) {
    good += a.kept;
    bad += a.swapped;
  }
  // Too little anywhere to call an average: assume even odds.
  const average = good + bad >= 5 ? good / (good + bad) : 0.5;

  const rows = venueIds.map((venue_id): PullRow => {
    const a = acc.get(venue_id) ?? { shown: 0, kept: 0, swapped: 0, engaged: 0, views: 0, dwell: [] };
    const n = a.kept + a.swapped;
    const rate = (a.kept + PULL.prior * average) / (n + PULL.prior);
    const lean =
      good + bad >= PULL.minTotal ? Math.max(-PULL.cap, Math.min(PULL.cap, PULL.scale * (rate - average))) : 0;
    const explore = PULL.exploreMax * Math.max(0, 1 - a.shown / PULL.exploreBelow);
    const sorted = [...a.dwell].sort((x, y) => x - y);
    return {
      venue_id,
      shown: round(a.shown),
      kept: round(a.kept),
      swapped: round(a.swapped),
      engaged: round(a.engaged),
      views: a.views,
      dwell_ms: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      rate: n > 0 ? round(rate, 4) : null,
      confidence: round(n / (n + PULL.prior), 4),
      effect: round(lean + explore, 3),
    };
  });
  return { rows, average };
}

/** Read the window's signals, work out every active venue's pull, write it. */
export async function refreshPull(db: SupabaseClient): Promise<{ venues: number; signals: number; average: number }> {
  const since = new Date(Date.now() - PULL.windowDays * 864e5).toISOString();
  const [signals, { data: venues, error }] = await Promise.all([
    fetchAllRows<Signal>(
      (from, to) =>
        db
          .from("plan_signals")
          .select("device_id, venue_id, kind, plan_key, created_at, value")
          .gte("created_at", since)
          .order("id")
          .range(from, to),
      1000,
      4
    ),
    db.from("venues").select("id").eq("is_active", true),
  ]);
  if (error) throw new Error(`venues: ${error.message}`);

  const { rows, average } = computePull(signals, ((venues ?? []) as { id: string }[]).map((v) => v.id));
  const computed_at = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await db.from("venue_pull").upsert(rows.slice(i, i + 500).map((r) => ({ ...r, computed_at })));
    if (e) throw new Error(`venue_pull: ${e.message}`);
  }
  return { venues: rows.length, signals: signals.length, average };
}

/**
 * What a venue's pull adds to its score in a plan. PULL_WEIGHT scales it, and
 * 0 turns it off without a deploy of anything but the variable.
 */
export function pullScore(v: { pull?: number | null }): number {
  const weight = Number(process.env.PULL_WEIGHT ?? 1);
  if (!v.pull || !Number.isFinite(weight)) return 0;
  return v.pull * weight;
}
