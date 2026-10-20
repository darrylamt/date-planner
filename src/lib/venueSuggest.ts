import { CUISINE_KINDS, VENUE_VIBE_TAGS, type VenueDraft } from "@/lib/catalog";
import { geminiJSON, ownImage, type GeminiResult } from "@/lib/gemini";

/**
 * A venue's listing, suggested from what we already hold: its photos, its
 * menu and what is written about it (admin, Gemini).
 *
 * What the old Opus research did for a new venue, for the catalogue we have:
 * the vibe tags, occasions and cuisines that decide whether a plan finds a
 * place at all, and a plain description where there is none. Nothing is
 * saved; the admin form is filled and the admin decides. The web is not
 * searched: Google Search grounding is not in the free tier.
 *
 * It also looks at each photo, because the first photo is what a plan shows,
 * and a photographed menu or a logo as a venue's picture sells nothing.
 */
const BEST_FOR = [
  "first_date", "anniversary", "date_night", "birthday", "graduation", "celebration",
  "friend_outing", "solo_day", "business_meeting", "family_day", "casual_hangout",
] as const;

export type PhotoNote = { url: string; verdict: "good" | "menu" | "blurry_or_dark" | "logo_or_poster" | "not_the_venue"; note: string };
export type VenueSuggestion = {
  draft: VenueDraft;
  cuisines: string[];
  photos: PhotoNote[];
  /** The photo that should lead, when it is not the one leading now. */
  bestPhoto: string | null;
  reasons: string;
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    description: { type: "STRING" },
    vibe_tags: { type: "ARRAY", items: { type: "STRING", enum: [...VENUE_VIBE_TAGS] } },
    best_for: { type: "ARRAY", items: { type: "STRING", enum: [...BEST_FOR] } },
    cuisines: { type: "ARRAY", items: { type: "STRING", enum: [...CUISINE_KINDS] } },
    dress_code: { type: "STRING" },
    photos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          verdict: { type: "STRING", enum: ["good", "menu", "blurry_or_dark", "logo_or_poster", "not_the_venue"] },
          note: { type: "STRING" },
        },
        required: ["index", "verdict"],
      },
    },
    bestPhotoIndex: { type: "INTEGER" },
    reasons: { type: "STRING" },
  },
  required: ["description", "vibe_tags", "best_for", "cuisines", "photos", "reasons"],
};

export async function suggestVenue(v: {
  name: string;
  type: string;
  area: string;
  description: string;
  vibe_tags: string[];
  best_for: string[];
  photos: string[];
  menu: { name: string; category: string; price_ghs: number }[];
}): Promise<GeminiResult<VenueSuggestion>> {
  const images = (await Promise.all(v.photos.slice(0, 5).map((u) => ownImage(u).then((img) => (img ? { url: u, img } : null))))).filter(
    (x): x is { url: string; img: { mime: string; data: Buffer } } => x !== null
  );
  const prices = v.menu.map((m) => m.price_ghs).filter((p) => p > 0).sort((a, b) => a - b);
  const facts = [
    `Venue: ${v.name}, a ${v.type} in ${v.area || "Accra"}, Ghana.`,
    v.description ? `Current description: ${v.description}` : "No description yet.",
    v.vibe_tags.length ? `Current vibe tags: ${v.vibe_tags.join(", ")}.` : "No vibe tags yet.",
    v.best_for.length ? `Currently good for: ${v.best_for.join(", ")}.` : "",
    v.menu.length
      ? `Menu (${v.menu.length} items, GHS ${prices[0]} to ${prices[prices.length - 1]}, median ${prices[Math.floor(prices.length / 2)]}): ${v.menu
          .slice(0, 60)
          .map((m) => `${m.name} (${m.category}, ${m.price_ghs})`)
          .join("; ")}`
      : "No menu on file.",
    images.length ? `The ${images.length} photo(s) attached are the venue's listing photos, in order, numbered from 0.` : "No photos.",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `${facts}

Suggest the listing for a date and outing planner in Accra, from the photos, the menu and the facts above only. Never invent what you cannot see or read.
- description: two or three plain sentences: what kind of place it is, what it is like to be there, what it is known for on the menu. No hype words ("vibrant", "nestled", "hidden gem"), no prices, no opening hours. Keep facts from the current description that the photos do not contradict.
- vibe_tags: up to four that the photos and menu clearly support.
- best_for: the occasions it suits, from the list. casual_hangout for easy everyday places.
- cuisines: for places that serve food, what the menu shows; else empty.
- dress_code: only if the photos make it obvious (e.g. "Smart casual"), else "".
- photos: for each photo by index, "good" if it shows the venue itself well, else why not (a photographed menu, too blurry or dark, a logo or poster, not the venue), with a few words in note.
- bestPhotoIndex: the photo that best sells the place to someone choosing where to go, or -1 if none is good.
- reasons: one sentence on what the tags are based on.`;

  const r = await geminiJSON<{
    description: string;
    vibe_tags: string[];
    best_for: string[];
    cuisines: string[];
    dress_code?: string;
    photos: { index: number; verdict: PhotoNote["verdict"]; note?: string }[];
    bestPhotoIndex?: number;
    reasons: string;
  }>({ parts: images.map((i) => ({ inline: i.img })), prompt, schema: SCHEMA });
  if (!r.ok) return r;
  const d = r.data;
  const vibes = (d.vibe_tags ?? []).filter((t) => (VENUE_VIBE_TAGS as readonly string[]).includes(t)).slice(0, 4);
  const draft = {
    found: true,
    canonical_name: null,
    type: null,
    area_name: null,
    address: null,
    description: (d.description ?? "").trim().slice(0, 700),
    price_band: null,
    avg_cost_per_person_ghs: 0,
    price_signal: null,
    is_free: false,
    vibe_tags: vibes,
    best_for: (d.best_for ?? []).filter((b) => (BEST_FOR as readonly string[]).includes(b)),
    reservation_required: false,
    dress_code: d.dress_code?.trim() ? d.dress_code.trim().slice(0, 60) : null,
    phone: null,
    instagram_handle: null,
    google_maps_url: null,
    website: null,
    lat: null,
    lng: null,
  } as unknown as VenueDraft;
  const photos: PhotoNote[] = (d.photos ?? [])
    .filter((p) => images[p.index])
    .map((p) => ({ url: images[p.index].url, verdict: p.verdict, note: (p.note ?? "").slice(0, 120) }));
  const best = d.bestPhotoIndex != null && d.bestPhotoIndex >= 0 ? images[d.bestPhotoIndex]?.url ?? null : null;
  return {
    ok: true,
    model: r.model,
    data: {
      draft,
      cuisines: (d.cuisines ?? []).filter((c) => (CUISINE_KINDS as readonly string[]).includes(c)),
      photos,
      bestPhoto: best && best !== v.photos[0] ? best : null,
      reasons: (d.reasons ?? "").slice(0, 300),
    },
  };
}
