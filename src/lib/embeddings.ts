import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What each venue is like, as 256 numbers (venue_embeddings, 0092), so that
 * a person's taste (taste.ts) can reach places they have never been shown.
 *
 * Read by Gemini's embedding model, free tier, from what the catalogue says
 * about the place: type, kitchens, vibe, what it suits, price band, area,
 * and what the study (0088) saw, its features and the dishes it is known
 * for. Not the name: "Bistro 22" says nothing about whether you would like
 * it, and names would pull unrelated places with similar words together.
 *
 * Only venues whose text has changed are read again (text_hash), so the
 * nightly run costs a handful of calls, not the catalogue.
 *
 * The free tier allows 100 texts a minute, counted per text rather than per
 * request: batches of 90, a minute apart. The nightly job asks for one batch
 * (it has a minute to run); the script fills the whole catalogue.
 */
const BATCH = 90;
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 256;

type VenueForText = {
  id: string;
  type: string;
  cuisine: string | null;
  cuisines: string[] | null;
  vibe_tags: string[] | null;
  best_for: string[] | null;
  price_band: string | null;
  description: string | null;
  areas: { name: string } | null;
};

type InsightForText = {
  venue_id: string;
  noise: string | null;
  features: string[] | null;
  signature_dishes: string[] | null;
};

export function venueText(v: VenueForText, i?: InsightForText): string {
  const parts = [
    `A ${v.type.replace(/_/g, " ")} in ${v.areas?.name ?? "Accra"}, Ghana.`,
    v.price_band ? `Price: ${v.price_band}.` : "",
    v.cuisines?.length ? `Food: ${v.cuisines.join(", ")}.` : v.cuisine && v.cuisine !== "both" ? `Food: ${v.cuisine}.` : "",
    v.vibe_tags?.length ? `Feel: ${v.vibe_tags.join(", ").replace(/_/g, " ")}.` : "",
    v.best_for?.length ? `Good for: ${v.best_for.join(", ").replace(/_/g, " ")}.` : "",
    i?.noise ? `Noise: ${i.noise}.` : "",
    i?.features?.length ? `Has: ${i.features.slice(0, 10).join(", ")}.` : "",
    i?.signature_dishes?.length ? `Known for: ${i.signature_dishes.slice(0, 8).join(", ")}.` : "",
    v.description ? v.description.slice(0, 400) : "",
  ];
  return parts.filter(Boolean).join(" ");
}

const hash = (s: string) => createHash("sha1").update(`${EMBED_MODEL}:${EMBED_DIMS}:${s}`).digest("hex");

async function embedBatch(texts: string[], key: string): Promise<number[][]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: EMBED_DIMS,
        })),
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini embeddings ${res.status}: ${(await res.text()).slice(0, 2000)}`);
  const body = (await res.json()) as { embeddings: { values: number[] }[] };
  return body.embeddings.map((e) => e.values);
}

/** Embed every active venue whose text has changed, at most `limit` of them. */
export async function embedChangedVenues(db: SupabaseClient, limit = BATCH): Promise<{ embedded: number; unchanged: number }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { embedded: 0, unchanged: 0 };

  const [{ data: venues, error }, { data: insights }, { data: stored }] = await Promise.all([
    db
      .from("venues")
      .select("id, type, cuisine, cuisines, vibe_tags, best_for, price_band, description, areas(name)")
      .eq("is_active", true),
    db.from("venue_insights").select("venue_id, noise, features, signature_dishes"),
    db.from("venue_embeddings").select("venue_id, text_hash"),
  ]);
  if (error) throw new Error(`venues: ${error.message}`);

  const insightOf = new Map(((insights ?? []) as InsightForText[]).map((i) => [i.venue_id, i]));
  const hashOf = new Map(((stored ?? []) as { venue_id: string; text_hash: string }[]).map((s) => [s.venue_id, s.text_hash]));
  const todo = ((venues ?? []) as unknown as VenueForText[])
    .map((v) => {
      const text = venueText(v, insightOf.get(v.id));
      return { id: v.id, text, hash: hash(text) };
    })
    .filter((v) => hashOf.get(v.id) !== v.hash);

  const batch = todo.slice(0, limit);
  for (let i = 0; i < batch.length; i += BATCH) {
    if (i > 0) await new Promise((r) => setTimeout(r, 61_000));
    const chunk = batch.slice(i, i + BATCH);
    const vectors = await embedBatch(
      chunk.map((c) => c.text),
      key
    );
    const { error: e } = await db.from("venue_embeddings").upsert(
      chunk.map((c, j) => ({
        venue_id: c.id,
        embedding: vectors[j].map((x) => Math.round(x * 1e5) / 1e5),
        text_hash: c.hash,
        model: EMBED_MODEL,
        updated_at: new Date().toISOString(),
      }))
    );
    if (e) throw new Error(`venue_embeddings: ${e.message}`);
  }
  return { embedded: batch.length, unchanged: (venues?.length ?? 0) - todo.length };
}
