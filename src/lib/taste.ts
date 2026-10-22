import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One person's taste, worked out for each plan from what they have done in
 * their own plans (plan_signals): the places they keep and swap out, and the
 * dishes they add and take off.
 *
 * ── places ────────────────────────────────────────────────────────────────
 * Kept places pull the plan towards places like them and swapped-out places
 * push it away, through each venue's embedding (0092, embeddings.ts), so the
 * taste reaches places they have never been shown. Someone who keeps rooftop
 * cocktail bars gets a nudge towards the rooftop bar they have not met.
 * Worth at most 1.5 points, half a vibe tag, and only once there are three
 * things to go on: their own choices tilt a plan, never write it.
 *
 * ── dishes ────────────────────────────────────────────────────────────────
 * Words, not dishes: "grilled tilapia" added at one place counts for tilapia
 * and for grilled at the next. Added counts for, taken off counts against.
 * Joins the recommendations and the venue's signature dishes in choosing what
 * a stop orders (planner.ts), at most two recommendations' worth either way.
 *
 * Whose: the account when signed in, which follows them to a new phone,
 * otherwise this phone. "Reset what Duro has learned" in the app deletes the
 * signals this is built from (/api/taste/reset).
 */
export const TASTE = {
  windowDays: 180,
  halfLifeDays: 45,
  /** Signals before places lean at all. */
  minPlaces: 3,
  /** Dish signals before dishes lean at all. */
  minDishes: 2,
  cap: 1.5,
  /** Points per unit of cosine similarity, before the cap. */
  scale: 3,
  dishCap: 2,
} as const;

const PLACE: Record<string, number> = {
  saved: 1,
  shared: 1,
  book_tapped: 0.5,
  directions_tapped: 0.5,
  menu_opened: 0.25,
  details_opened: 0.25,
  maps_opened: 0.25,
  instagram_opened: 0.25,
  swapped_away: -1,
};

/** Words that say nothing about what somebody likes to eat. */
const STOP = new Set(
  "a an and the of with in on or for to de la le plus extra large small medium regular big mini half full portion pcs pc piece pieces serves serve per person people pax ml cl l litre liter bottle glass cup shot jug pitcher plate bowl side sides special house our chef chefs signature combo platter menu new fresh"
    .split(" ")
);

export function dishWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-zÀ-ɏ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export interface Taste {
  /** Points per venue id; venues not in it get nothing. */
  places: Map<string, number>;
  /** Word weights for choosing dishes, roughly -1 to 1. */
  words: Record<string, number>;
}

type Sig = { kind: string; venue_id: string; item: string | null; plan_key: string | null; device_id: string; created_at: string };

// The catalogue's vectors, kept for half an hour per server instance.
let cache: { at: number; vectors: Map<string, Float32Array> } | null = null;

async function vectors(db: SupabaseClient): Promise<Map<string, Float32Array>> {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.vectors;
  const { data, error } = await db.from("venue_embeddings").select("venue_id, embedding");
  if (error || !data?.length) return new Map();
  const raw = (data as { venue_id: string; embedding: number[] }[]).map((r) => ({ id: r.venue_id, e: Float32Array.from(r.embedding) }));
  /*
   * Centred on the catalogue's average before comparing. Every venue
   * description shares "a restaurant in Accra", so raw vectors all sit close
   * together and every cosine is high; what matters is how each place differs
   * from the rest.
   */
  const dims = raw[0].e.length;
  const mean = new Float32Array(dims);
  for (const r of raw) for (let i = 0; i < dims; i++) mean[i] += r.e[i] / raw.length;
  const out = new Map<string, Float32Array>();
  for (const r of raw) {
    const c = new Float32Array(dims);
    let n = 0;
    for (let i = 0; i < dims; i++) {
      c[i] = r.e[i] - mean[i];
      n += c[i] * c[i];
    }
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < dims; i++) c[i] /= n;
    out.set(r.id, c);
  }
  cache = { at: Date.now(), vectors: out };
  return out;
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Pure, for the smoke test: the taste these signals and vectors make. */
export function computeTaste(signals: Sig[], vecs: Map<string, Float32Array>, now = Date.now()): Taste {
  const seen = new Set<string>();
  const placeW = new Map<string, number>();
  const words: Record<string, number> = {};
  let placeN = 0;
  let dishN = 0;

  for (const s of signals) {
    const age = (now - Date.parse(s.created_at)) / 864e5;
    if (!Number.isFinite(age) || age > TASTE.windowDays) continue;
    const w = 0.5 ** (Math.max(0, age) / TASTE.halfLifeDays);
    const unit = s.plan_key ?? `${s.device_id}:${s.created_at.slice(0, 10)}`;
    const once = `${s.kind}|${unit}|${s.venue_id}|${s.item ?? ""}`;
    if (seen.has(once)) continue;
    seen.add(once);

    if (PLACE[s.kind] != null) {
      placeW.set(s.venue_id, (placeW.get(s.venue_id) ?? 0) + PLACE[s.kind] * w);
      placeN += 1;
    } else if ((s.kind === "dish_added" || s.kind === "dish_removed") && s.item) {
      const sign = s.kind === "dish_added" ? 1 : -1;
      for (const word of dishWords(s.item)) words[word] = (words[word] ?? 0) + sign * w;
      dishN += 1;
    }
  }

  // Places: one direction, from towards what they keep and away from what they swap.
  const places = new Map<string, number>();
  if (placeN >= TASTE.minPlaces && vecs.size) {
    const dims = vecs.values().next().value!.length;
    const dir = new Float32Array(dims);
    for (const [id, wt] of placeW) {
      const v = vecs.get(id);
      if (!v || !wt) continue;
      for (let i = 0; i < dims; i++) dir[i] += wt * v[i];
    }
    const norm = Math.sqrt(dot(dir, dir));
    if (norm > 0) {
      for (let i = 0; i < dims; i++) dir[i] /= norm;
      // More signals, more say: full weight from about eight.
      const sure = Math.min(1, placeN / 8);
      for (const [id, v] of vecs) {
        const pts = Math.max(-TASTE.cap, Math.min(TASTE.cap, TASTE.scale * dot(v, dir) * sure));
        if (Math.abs(pts) >= 0.05) places.set(id, Math.round(pts * 100) / 100);
      }
    }
  }

  // Dishes: the strongest words, scaled so the strongest is ±1.
  const outWords: Record<string, number> = {};
  if (dishN >= TASTE.minDishes) {
    const top = Object.entries(words)
      .filter(([, x]) => Math.abs(x) > 0.01)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 40);
    const max = Math.max(...top.map(([, x]) => Math.abs(x)), 1);
    for (const [k, x] of top) outWords[k] = Math.round((x / max) * 100) / 100;
  }

  return { places, words: outWords };
}

/** What a dish is worth to this person: up to two recommendations either way. */
export function dishTaste(words: Record<string, number> | undefined, name: string): number {
  if (!words) return 0;
  let s = 0;
  for (const w of dishWords(name)) s += words[w] ?? 0;
  return Math.max(-TASTE.dishCap, Math.min(TASTE.dishCap, s * 1.5));
}

const DEVICE = /^[A-Za-z0-9_-]{6,64}$/;

/** This person's taste, or null when there is nobody to know or nothing yet. */
export async function tasteFor(db: SupabaseClient, who: { deviceId?: string | null; userId?: string | null }): Promise<Taste | null> {
  const deviceId = who.deviceId && DEVICE.test(who.deviceId) ? who.deviceId : null;
  const userId = who.userId ?? null;
  if (!deviceId && !userId) return null;

  const since = new Date(Date.now() - TASTE.windowDays * 864e5).toISOString();
  let q = db
    .from("plan_signals")
    .select("kind, venue_id, item, plan_key, device_id, created_at")
    .gte("created_at", since)
    .neq("kind", "shown")
    .neq("kind", "swapped_in")
    .neq("kind", "venue_viewed")
    .order("id", { ascending: false })
    .limit(1500);
  q = userId && deviceId ? q.or(`user_id.eq.${userId},device_id.eq.${deviceId}`) : userId ? q.eq("user_id", userId) : q.eq("device_id", deviceId!);

  const [{ data, error }, vecs] = await Promise.all([q, vectors(db)]);
  if (error || !data?.length) return null;
  const taste = computeTaste(data as Sig[], vecs);
  return taste.places.size || Object.keys(taste.words).length ? taste : null;
}
