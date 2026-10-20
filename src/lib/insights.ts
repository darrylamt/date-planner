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
 * The most common complaint about vibes was a first date somewhere nobody
 * could hear each other. Talking occasions lean hard away from loud places
 * and towards quiet ones; celebrations lean the other way. Loud is never
 * ruled out: when nothing else fits the budget, a loud place beats no plan.
 */
const TALKING = new Set(["first_date", "anniversary", "date_night", "business_meeting"]);
const PARTYING = new Set(["birthday", "friend_outing", "celebration", "graduation"]);
const QUIET_VIBES = ["calm", "romantic", "chill"];
const LOUD_VIBES = ["lively", "dancing", "club hopping", "fun"];

const CONFIDENCE = { low: 0.5, medium: 0.8, high: 1 } as const;

export function noiseScore(v: Venue, inputs: Pick<PlanInputs, "occasion" | "vibes">): number {
  const noise = v.insights?.noise;
  if (!noise) return 0;
  const vibes = (inputs.vibes ?? []).map((x) => x.toLowerCase());
  const wantsQuiet = TALKING.has(inputs.occasion) || vibes.some((x) => QUIET_VIBES.includes(x));
  const wantsLoud = PARTYING.has(inputs.occasion) || vibes.some((x) => LOUD_VIBES.includes(x));
  // Asked for both (a lively date night): no lean either way.
  if (wantsQuiet && wantsLoud) return 0;
  if (wantsQuiet) return { quiet: 1.5, conversational: 1, buzzy: -1, loud: -4 }[noise];
  if (wantsLoud) return { quiet: -1, conversational: 0, buzzy: 1.5, loud: 1 }[noise];
  return 0;
}

/** -2 to +2 from the 0-10 fit for this occasion, centred on 5. */
export function fitScore(v: Venue, occasion: string): number {
  const fit = v.insights?.occasion_fit?.[occasion];
  if (typeof fit !== "number" || !Number.isFinite(fit)) return 0;
  return ((Math.max(0, Math.min(10, fit)) - 5) / 5) * 2;
}

/** Everything the study adds to a venue's score for this plan. */
export function insightScore(v: Venue, inputs: Pick<PlanInputs, "occasion" | "vibes">): number {
  if (!v.insights) return 0;
  const weight = CONFIDENCE[v.insights.confidence] ?? 0.5;
  return (noiseScore(v, inputs) + fitScore(v, inputs.occasion)) * weight;
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
