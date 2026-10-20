import { KINDS } from "@/components/planner/nights";
import { VENUE_VIBE_TAGS } from "@/lib/catalog";
import { geminiJSON, type GeminiResult } from "@/lib/gemini";

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
  required: ["isEvent", "title", "kind", "dates", "time", "venueName", "costMode", "audience", "vibes", "description"],
};

function prompt(today: string): string {
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `This is a poster for an event in Accra, Ghana. Today is ${weekday} ${today}. Read it into these fields:
- isEvent: false if this is not an event poster at all (a menu, a selfie, a logo), and leave the rest empty.
- title: the event's own name as printed, in normal capitalisation (not ALL CAPS). Not the venue, not a slogan.
- kind: the closest of: ${KINDS.map((k) => `${k.id} (${k.label})`).join(", ")}; "other" with otherKind in two or three words if none fits.
- dates: every date it happens, as YYYY-MM-DD. Posters leave out the year: use the next such date from today. "Every Friday" means the next four Fridays. Empty if no date is printed.
- time: start time, 24-hour HH:MM ("8pm till late" is 20:00). endTime likewise, or "".
- venueName: the venue's name as printed. area: the neighbourhood if printed (Osu, East Legon, Labone...), else "".
- costMode and cost: "free" for free entry; "paid" with cost the cheapest price for one person to get in (early bird or regular, never a table or VIP package) in Ghana cedis; "unknown" if no price is printed.
- bookingUrl: a ticket link if printed (add https:// if missing), else "". phone: a contact number as printed, else "".
- audience: "women" for ladies-only nights, "men" for men only, else "everyone". "Ladies free before 10" is still everyone.
- vibes: up to three that the poster plainly shows, from the allowed list.
- description: two short sentences in plain English saying what the night is and what to expect, from the poster only. No hype, no emojis, no prices or dates.
- dressCode: if printed, else "".`;
}

export async function readFlyer(image: { mime: string; data: Buffer }): Promise<GeminiResult<FlyerDraft>> {
  const today = new Date().toISOString().slice(0, 10); // Accra is UTC all year
  const r = await geminiJSON<FlyerDraft>({ parts: [{ inline: image }], prompt: prompt(today), schema: SCHEMA });
  if (!r.ok) return r;
  const d = r.data;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const draft: FlyerDraft = {
    isEvent: d.isEvent !== false,
    title: (d.title ?? "").trim().slice(0, 120),
    kind: KINDS.some((k) => k.id === d.kind) ? d.kind : "other",
    otherKind: (d.otherKind ?? "").trim().slice(0, 40),
    // Only real dates from today on, at most a dozen.
    dates: [...new Set((d.dates ?? []).filter((x) => iso.test(x) && x >= today))].sort().slice(0, 12),
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
