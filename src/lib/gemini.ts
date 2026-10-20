/**
 * Gemini on Google AI Studio's free tier (GEMINI_API_KEY), for the jobs that
 * read pictures and tidy the catalogue: menus, event posters, venue copy.
 *
 * Free rather than Anthropic because these are many small, public-facing
 * reads and the owner found the API spend too high. Free-tier requests may be
 * used by Google to improve its products, so only public material goes
 * through here: menus, posters, venue photos and descriptions. Never what a
 * person types about themselves or someone else; plan copy and Durobot stay
 * where the consent screen says they are.
 *
 * Each model has its own free daily allowance (AI Studio, Oct 2026). The full
 * Flash models read untidy photos best but allow 20 a day each; Flash Lite
 * allows 500 and did as well on test menus; Gemma 4 allows 14,400. A model
 * that is busy or used up hands on to the next, so a call fails only when all
 * of them have. 2.5 Flash is closed to new keys.
 */
export const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemma-4-31b-it",
];

/** Cheaper first, for small text jobs that do not need the best eyes. */
export const GEMINI_LIGHT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemma-4-31b-it", "gemini-3.8-flash"];

export type GeminiPart = { inline: { mime: string; data: Buffer } } | { text: string };

export type GeminiResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; reason: "no_key" | "limit" | "failed"; message: string };

export const GEMINI_LIMIT_MESSAGE = "Gemini's free daily limit is used up. It resets at midnight Pacific time (8 am in Accra).";

/** One structured answer: the parts, the instructions, and the JSON schema it must fill. */
export async function geminiJSON<T>({
  parts,
  prompt,
  schema,
  models = GEMINI_MODELS,
  timeoutMs = 45_000,
}: {
  parts: GeminiPart[];
  prompt: string;
  schema: object;
  models?: string[];
  timeoutMs?: number;
}): Promise<GeminiResult<T>> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, reason: "no_key", message: "GEMINI_API_KEY is not set on the server." };

  const content = [
    ...parts.map((p) => ("inline" in p ? { inline_data: { mime_type: p.inline.mime, data: p.inline.data.toString("base64") } } : { text: p.text })),
    { text: prompt },
  ];

  let limited = false;
  for (const model of models) {
    // Gemma takes no response schema: the JSON is asked for in words and read the same way.
    const gemma = model.startsWith("gemma");
    const request = gemma
      ? { contents: [{ parts: [...content, { text: `Answer with JSON only, shaped like this schema: ${JSON.stringify(schema)}` }] }], generationConfig: { temperature: 0 } }
      : { contents: [{ parts: content }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 } };
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      continue;
    }
    if (res.status === 429) {
      limited = true;
      continue;
    }
    if (!res.ok) continue;
    const json = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try {
      // A model without a response schema may wrap its JSON in a code fence.
      return { ok: true, data: JSON.parse(text.replace(/^[^{]*/, "").replace(/[^}]*$/, "")) as T, model };
    } catch {
      continue;
    }
  }
  return limited
    ? { ok: false, reason: "limit", message: GEMINI_LIMIT_MESSAGE }
    : { ok: false, reason: "failed", message: "Gemini didn't answer. Try again in a minute." };
}

/**
 * A picture from our own storage, fetched to be read.
 *
 * Only our bucket: a URL from the request is never fetched from anywhere
 * else, or this would be a way to make the server download anything.
 */
export async function ownImage(url: string): Promise<{ mime: string; data: Buffer } | null> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base || !url.startsWith(`${base}/storage/v1/object/public/images/`)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    if (!mime.startsWith("image/")) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length > 6_000_000 ? null : { mime, data };
  } catch {
    return null;
  }
}
