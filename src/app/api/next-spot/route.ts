import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { VENUE_SELECT } from "@/lib/venueColumns";
import { expandVibes } from "@/lib/catalog";
import { estimateHop, haversineKm } from "@/lib/transport";
import { cityAt } from "@/lib/neighbourhoods";
import { describePrice, hoursOn, isPriced, medianPrice, menusFor, openStateAt, type PriceNote } from "@/lib/chat/tools/shared";
import type { MenuItem, Venue, VenueType } from "@/lib/types";
import { clock, eventTiming } from "@/lib/eventNight";

/**
 * Where next: one more place for a night that is already under way.
 *
 * Asked two ways. On a plan's own screen, by a shake or the button, from the
 * stop the night has reached. And with no plan at all, from the "Where
 * next?" screen: a mood picked, the phone shaken, from where they are
 * standing or an area they chose. Either way: near there, open at the time they would get there,
 * the kind of place that suits the hour and the night, not one already in the
 * plan, and priced: the same rule as every other answer, so an unpriced place
 * is never offered as though it were cheap.
 *
 * A short list, not one place, so shaking again shows the next without
 * another request, and with a little chance in the order so two shakes on the
 * same street do not always agree.
 */

const bodySchema = z.object({
  anchor_venue_id: z.string().uuid().nullable().optional(),
  /** No plan and no location: the middle of an area's venues. */
  area_id: z.string().uuid().optional(),
  /** A mood picked on the screen that names its own kinds of place ("something sweet"). */
  // "event" asks for what is happening next instead of a place (30 Oct 2026).
  kinds: z.array(z.enum(["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert", "wellness", "event"])).max(8).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{1,2}:\d{2}$/),
  occasion: z.string().max(40).default("friend_outing"),
  vibes: z.array(z.string().max(40)).max(12).default([]),
  party_size: z.number().int().min(1).max(50).default(2),
  city: z.string().max(60).optional(),
  exclude: z.array(z.string().uuid()).max(40).default([]),
  // How many to send back: six for a shake, up to eight to fill a wheel.
  count: z.number().int().min(1).max(8).default(6),
});

export type NextSpot = {
  id: string;
  name: string;
  area: string;
  type: VenueType;
  image_url: string | null;
  blurb: string | null;
  km: number;
  mins: number;
  fare_ghs: number;
  price: PriceNote;
  /** What a visit of this kind costs: drinks at a bar, a dessert at a dessert place. Null when the menu cannot say. */
  visit: { what: string; ghs: number } | null;
  open: "open" | "unknown";
  hours: string;
  lat: number | null;
  lng: number | null;
  /** Set when this is an event rather than a place (kinds: ["event"]). */
  event?: { title: string; venue: string; starts: string; fixed: boolean };
};

const ROMANTIC = new Set(["first_date", "anniversary", "date_night"]);

/*
 * What somebody orders on a "one more place" visit, by kind of place, in the
 * order to look for it. A bar is drinks, or small plates where it lists no
 * drinks, never its dinner: a late stop priced at its mains read as GHS 725
 * a head for a lounge. The figure is the median of that part of the menu.
 */
const VISIT: Record<VenueType, [MenuItem["category"], string][]> = {
  lounge: [["drink", "Drinks"], ["starter", "Small plates"], ["main", "Food"]],
  dessert: [["dessert", "Desserts"], ["drink", "Drinks"]],
  cafe: [["drink", "Drinks"], ["dessert", "Desserts and pastries"], ["main", "Food"]],
  activity: [["activity", "A go"], ["other", "Entry"]],
  outdoor: [["activity", "Entry"], ["other", "Entry"]],
  wellness: [["activity", "Treatments"], ["other", "Treatments"]],
  restaurant: [["main", "Mains"], ["starter", "Small plates"]],
  // A place to sleep is never "one more place" (0099).
  stay: [],
};

function visitPrice(type: VenueType, menu: MenuItem[]): { what: string; ghs: number } | null {
  for (const [category, what] of VISIT[type] ?? []) {
    const ghs = medianPrice(menu, category);
    if (ghs != null) return { what, ghs };
  }
  return null;
}

/**
 * The kinds of place that fit the hour and the night.
 *
 * After dinner is drinks and dessert, not another dinner, which is why there
 * is no restaurant here at night. Late and lively is a bar or a lounge. A
 * family's evening never ends in one. Daytime is a café, dessert, something
 * to do, or somewhere outside.
 */
function kindsFor(occasion: string, vibes: string[], time: string): VenueType[] {
  const hour = Number(time.split(":")[0]);
  const tags = expandVibes(vibes);
  const lively = tags.includes("dancing") || tags.includes("lively");
  if (occasion === "family_day") return hour >= 17 ? ["dessert", "activity"] : ["dessert", "activity", "cafe", "outdoor"];
  if (occasion === "business_meeting") return ["cafe", "lounge"];
  if (hour >= 21 || hour < 5) return lively ? ["lounge"] : ["lounge", "dessert"];
  if (hour >= 17) return ROMANTIC.has(occasion) ? ["dessert", "lounge", "activity"] : ["lounge", "dessert", "activity"];
  return ["cafe", "dessert", "activity", "outdoor"];
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const b = parsed.data;
  const supabase = createClient();

  // Where the night is: the stop it has reached, or a point the phone sent.
  let anchor: { lat: number; lng: number } | null =
    b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null;
  if (!anchor && b.anchor_venue_id) {
    const { data } = await supabase.from("venues").select("lat,lng").eq("id", b.anchor_venue_id).maybeSingle();
    if (data?.lat != null && data?.lng != null) anchor = { lat: Number(data.lat), lng: Number(data.lng) };
  }
  if (!anchor && b.area_id) {
    const { data } = await supabase.from("venues").select("lat,lng").eq("area_id", b.area_id).eq("is_active", true);
    const pts = ((data ?? []) as { lat: number | null; lng: number | null }[]).filter((v) => v.lat != null && v.lng != null);
    if (pts.length) {
      anchor = {
        lat: pts.reduce((s, v) => s + Number(v.lat), 0) / pts.length,
        lng: pts.reduce((s, v) => s + Number(v.lng), 0) / pts.length,
      };
    }
  }
  if (!anchor) return NextResponse.json({ spots: [], reason: "no_anchor" });

  if (b.kinds?.includes("event")) return NextResponse.json({ spots: await nextEvents(supabase, b, anchor), from: anchor });

  const kinds = (b.kinds?.length ? b.kinds : kindsFor(b.occasion, b.vibes, b.time)) as VenueType[];
  let q = supabase.from("venues").select(VENUE_SELECT).eq("is_active", true).in("type", kinds);
  /*
   * The phone's own position says which town it is in. The city the app
   * sent is the last one somebody planned in, so after planning a day in
   * Kumasi, "near me" in Accra searched Kumasi's venues for ones within
   * eight kilometres of Accra, and found nothing.
   */
  const city = b.lat != null && b.lng != null ? cityAt({ lat: b.lat, lng: b.lng }) ?? b.city?.trim() : b.city?.trim();
  const { data: cityAreas } = await supabase.from("areas").select("id").eq("city", city || "Accra");
  const areaIds = ((cityAreas ?? []) as { id: string }[]).map((a) => a.id);
  if (areaIds.length) q = q.in("area_id", areaIds);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "catalogue" }, { status: 502 });

  const excluded = new Set(b.exclude);
  const near = ((data ?? []) as unknown as Venue[])
    .filter((v) => !excluded.has(v.id) && v.lat != null && v.lng != null)
    .filter((v) => {
      const min = Number(v.min_party_size ?? 1);
      const max = v.max_party_size == null ? Infinity : Number(v.max_party_size);
      return b.party_size >= min && b.party_size <= max;
    })
    .map((v) => ({ v, km: haversineKm(anchor!, { lat: Number(v.lat), lng: Number(v.lng) }) }));

  // Close first, and wider only when close has too little: four kilometres, then eight.
  let pool = near.filter((x) => x.km <= 4);
  if (pool.length < 4) pool = near.filter((x) => x.km <= 8);

  const menus = await menusFor(supabase, pool.map((x) => x.v));
  const wanted = expandVibes(b.vibes);
  const ranked = pool
    .filter((x) => isPriced(x.v, (menus.get(x.v.id) ?? []).length))
    .map((x) => ({ ...x, open: openStateAt(x.v, b.date, b.time) }))
    // Shut is dropped; unknown hours stay, said as unknown, as everywhere else.
    .filter((x) => x.open !== "closed")
    .map((x) => ({
      ...x,
      score:
        (x.v.vibe_tags ?? []).filter((t) => wanted.includes(t)).length * 2 +
        (x.open === "open" ? 1 : 0) -
        x.km * 0.5 +
        Math.random() * 1.5,
    }))
    .sort((a, c) => c.score - a.score)
    .slice(0, b.count);

  const spots: NextSpot[] = ranked.map(({ v, km, open }) => {
    const hop = estimateHop(anchor!, v);
    return {
      id: v.id,
      name: v.name,
      area: v.areas?.name ?? "",
      type: v.type,
      image_url: v.image_url ?? null,
      blurb: firstSentence(v.description),
      km: Math.round(km * 10) / 10,
      mins: hop.mins,
      fare_ghs: hop.cost_ghs,
      price: describePrice(v, menus.get(v.id) ?? []),
      visit: visitPrice(v.type, menus.get(v.id) ?? []),
      open: open === "open" ? "open" : "unknown",
      hours: hoursOn(v, b.date),
      lat: v.lat == null ? null : Number(v.lat),
      lng: v.lng == null ? null : Number(v.lng),
    };
  });

  // Where the ride starts, so the app can offer one without asking for location.
  return NextResponse.json({ spots, from: anchor });
}

/*
 * What is happening next, near where the night is: a film or a class
 * starting soon that can still be reached by its start, or something on now
 * that can be walked into (eventNight.ts, eventTiming). Three hours ahead at
 * most, ten kilometres out, priced events only, the soonest and nearest first.
 */
async function nextEvents(
  supabase: ReturnType<typeof createClient>,
  b: z.infer<typeof bodySchema>,
  anchor: { lat: number; lng: number }
): Promise<NextSpot[]> {
  const now = Number(b.time.split(":")[0]) * 60 + Number(b.time.split(":")[1]);
  const venueCols = "id, name, type, lat, lng, image_url, description, areas(name)";
  const [{ data: evRows }, { data: filmRows }] = await Promise.all([
    supabase
      .from("events")
      .select(`id, title, category, start_time, cost_ghs, audience, venue_id, venues(${venueCols})`)
      .eq("is_active", true)
      .eq("event_date", b.date),
    // Showtimes are closed to the public key; read on the server, as the planner does (movies.ts).
    createServiceClient()
      .from("cinema_showtimes")
      .select(`id, title, show_time, runtime_mins, venue_id, venues(${venueCols})`)
      .eq("is_active", true)
      .eq("show_date", b.date)
      .not("venue_id", "is", null),
  ]);
  type V = { id: string; name: string; type: VenueType; lat: number | null; lng: number | null; image_url: string | null; description: string | null; areas: { name: string } | null };
  const items = [
    ...((evRows ?? []) as unknown as { title: string; category: string; start_time: string | null; cost_ghs: number | null; audience: string | null; venues: V | null }[])
      .filter((e) => e.cost_ghs != null && (!e.audience || e.audience === "everyone"))
      .map((e) => ({ title: e.title, start: e.start_time, ghs: Number(e.cost_ghs), venue: e.venues, ...eventTiming(e), what: "Entry" })),
    ...((filmRows ?? []) as unknown as { title: string; show_time: string | null; runtime_mins: number | null; venues: V | null }[]).map((f) => ({
      title: f.title,
      start: f.show_time,
      ghs: 130,
      venue: f.venues,
      ...eventTiming({ title: f.title, category: "movie", kind: "movie", runtime_mins: f.runtime_mins }),
      what: "Ticket and snacks",
    })),
  ];
  const excluded = new Set(b.exclude);
  const seen = new Set<string>();
  return items
    .flatMap((x) => {
      const v = x.venue;
      const at = x.start ? Number(x.start.slice(0, 2)) * 60 + Number(x.start.slice(3, 5)) : null;
      if (!v || at == null || v.lat == null || v.lng == null || excluded.has(v.id)) return [];
      const km = haversineKm(anchor, { lat: Number(v.lat), lng: Number(v.lng) });
      if (km > 10) return [];
      const hop = estimateHop(anchor, v as unknown as Venue);
      const arrive = now + hop.mins;
      const latest = x.fixed ? at : at < 17 * 60 ? Math.max(at, 20 * 60 - x.stay) : at + 240 - x.stay;
      if (at > now + 180 || (x.fixed ? arrive > at : arrive > latest)) return [];
      const wait = Math.max(0, at - arrive);
      return [{ x, v, at, km, hop, score: -wait / 20 - km * 0.4 + (x.fixed ? 0 : 0.5) + Math.random() }];
    })
    .sort((a, c) => c.score - a.score)
    .filter((r) => (seen.has(r.v.id) ? false : (seen.add(r.v.id), true)))
    .slice(0, b.count)
    .map(({ x, v, at, km, hop }) => ({
      id: v.id,
      name: x.title,
      area: [v.name, v.areas?.name].filter(Boolean).join(", "),
      type: v.type,
      image_url: v.image_url ?? null,
      blurb: x.fixed
        ? `Starts at ${clock(at)}. Be there for the start.`
        : at <= now
          ? "On now. Drop in any time while it is on."
          : `From ${clock(at)}. Drop in any time while it is on.`,
      km: Math.round(km * 10) / 10,
      mins: hop.mins,
      fare_ghs: hop.cost_ghs,
      price: x.ghs > 0 ? { basis: "menu" as const, typical_per_person_ghs: x.ghs } : { basis: "free" as const },
      visit: x.ghs > 0 ? { what: x.what, ghs: x.ghs } : null,
      open: "open" as const,
      hours: x.fixed ? `Starts ${clock(at)}` : at <= now ? "On now" : `From ${clock(at)}`,
      lat: Number(v.lat),
      lng: Number(v.lng),
      event: { title: x.title, venue: v.name, starts: clock(at), fixed: x.fixed },
    }));
}

function firstSentence(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const end = t.search(/[.!?](\s|$)/);
  const one = end === -1 ? t : t.slice(0, end + 1);
  return one.length > 140 ? `${one.slice(0, 137).trimEnd()}…` : one;
}
