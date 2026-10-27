import type { PlanInputs, Venue } from "./types";

/**
 * How what Gemini learned about a venue (venue_insights, 0088) moves its
 * score in a plan.
 *
 * Kept small next to the catalogue's own signals (a vibe tag is 3, a best-for
 * match 2, a named cuisine 6), because the study is a read of photos and a
 * menu, not a fact somebody checked. And weighed by how much there was to go
 * on: a venue read from a name and a type counts for half.
 *
 * ── noise ─────────────────────────────────────────────────────────────────
 * Follows what the person asked for, not the occasion. A date may want a
 * quiet table and nothing else, or dinner and then a rave; the owner's rule
 * (22 Oct 2026) is that wanting it decides it.
 *   asked for lively, dancing or club hopping: loud and buzzy are welcome,
 *     on a first date as much as a birthday.
 *   asked for calm, romantic or chill: quiet wins and loud is a long way
 *     down, never ruled out (a loud place beats no plan at all).
 *   asked for both: quiet early, loud welcome from ten at night, which is
 *     the shape of "a nice dinner, then out".
 *   asked for neither: a mild lean from the occasion, softer late at night.
 */
const TALKING = new Set(["first_date", "anniversary", "date_night", "business_meeting"]);
const PARTYING = new Set(["birthday", "friend_outing", "celebration", "graduation"]);
const QUIET_VIBES = ["calm", "romantic", "chill"];
const LOUD_VIBES = ["lively", "dancing", "club hopping"];
/** From here, a night has turned into a night out. */
const LATE = 22 * 60;

const CONFIDENCE = { low: 0.5, medium: 0.8, high: 1 } as const;
/** The occasions where the wrong room spoils the night. */
const SPECIAL = new Set(["anniversary", "date_night", "first_date"]);

const QUIET_WINS = { quiet: 1.5, conversational: 1, buzzy: -1, loud: -4 } as const;
const LOUD_WINS = { quiet: -1, conversational: 0, buzzy: 1.5, loud: 1.5 } as const;

/** Whether this plan asked for noise, for quiet, both, or neither. */
export function noiseWanted(inputs: Pick<PlanInputs, "vibes">): { quiet: boolean; loud: boolean } {
  const vibes = (inputs.vibes ?? []).map((x) => x.toLowerCase());
  return { quiet: vibes.some((x) => QUIET_VIBES.includes(x)), loud: vibes.some((x) => LOUD_VIBES.includes(x)) };
}

export function noiseScore(v: Venue, inputs: Pick<PlanInputs, "occasion" | "vibes">, atMinute?: number): number {
  const noise = v.insights?.noise;
  if (!noise) return 0;
  const want = noiseWanted(inputs);
  const late = atMinute != null && atMinute >= LATE;
  if (want.loud && want.quiet) return late ? LOUD_WINS[noise] : { quiet: 1.5, conversational: 1, buzzy: 0, loud: -2 }[noise];
  if (want.loud) return LOUD_WINS[noise];
  if (want.quiet) return QUIET_WINS[noise];
  if (TALKING.has(inputs.occasion)) return { quiet: 0.5, conversational: 0.5, buzzy: 0, loud: late ? -1 : -2 }[noise];
  if (PARTYING.has(inputs.occasion)) return { quiet: -0.5, conversational: 0, buzzy: 1, loud: 0.5 }[noise];
  return 0;
}

/** -2 to +2 from the 0-10 fit for this occasion, centred on 5. */
export function fitScore(v: Venue, occasion: string): number {
  const fit = v.insights?.occasion_fit?.[occasion];
  if (typeof fit !== "number" || !Number.isFinite(fit)) return 0;
  return ((Math.max(0, Math.min(10, fit)) - 5) / 5) * 2;
}

/** Everything the study adds to a venue's score for this plan. */
export function insightScore(v: Venue, inputs: Pick<PlanInputs, "occasion" | "vibes">, atMinute?: number): number {
  if (!v.insights) return 0;
  const weight = CONFIDENCE[v.insights.confidence] ?? 0.5;
  // Special nights lean twice as hard on whether the place suits them (owner, 27 Oct 2026).
  const fitWeight = SPECIAL.has(inputs.occasion) ? 2 : 1;
  return (noiseScore(v, inputs, atMinute) + fitScore(v, inputs.occasion) * fitWeight) * weight;
}

/**
 * Whether a menu line is one the venue is known for: what the study named,
 * matched loosely ("Seafood Platter" is "seafood platter (for 2)").
 */
export function isSignature(v: Venue, itemName: string): boolean {
  const names = v.insights?.signature_dishes;
  if (!names?.length) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const item = norm(itemName);
  return names.some((n) => {
    const sig = norm(n);
    return sig.length > 2 && (item === sig || item.startsWith(sig) || sig.startsWith(item));
  });
}
