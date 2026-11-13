import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatCard } from "../types";
import { listShowtimes } from "../movies";
import { tidyName } from "../nudges";
import { fold } from "../fold";

/*
 * Cards for what Durobot names (owner, 31 Oct 2026: "instead of giving items
 * in bullet form, why not create horizontal scroll of cards, showing the
 * picture of the venue or event, some details and some action buttons").
 *
 * Built from what the tools returned this message, never from the model's
 * words alone, so a card is always something the catalogue holds. Only the
 * ones the reply actually names become cards, in the order it names them: a
 * search for eight places that recommends three shows three. No extra model
 * call, so the answer is no slower.
 */

type Candidate =
  | { kind: "venue"; id: string; name: string; area: string; type: string; price: string | null; open?: string }
  | { kind: "event"; title: string; venueId: string | null; venue: string | null; when: string | null; price: string | null }
  | { kind: "night"; venueId: string; venue: string; night: string }
  | { kind: "film"; title: string; cinema: string | null; showing: string | null }
  | { kind: "fact"; title: string; fact: string; topic: string; source: string; url: string | null };

const MAX_CARDS = 8;
const TYPE_LABEL: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  lounge: "Bar",
  dessert: "Dessert",
  activity: "Something to do",
  outdoor: "Outdoors",
  wellness: "Spa",
};

function priceText(p: unknown): string | null {
  const note = p as { basis?: string; typical_per_person_ghs?: number; per_person_range_ghs?: [number, number] } | null;
  if (!note?.basis) return null;
  if (note.basis === "free") return "Free";
  if (note.basis === "menu" && note.typical_per_person_ghs) return `About GHS ${Math.round(note.typical_per_person_ghs)} a head`;
  if (note.basis === "estimated" && note.per_person_range_ghs) {
    return `GHS ${note.per_person_range_ghs[0]} to ${note.per_person_range_ghs[1]} a head, estimated`;
  }
  return null;
}

/** What one tool result offers as cards. */
export function cardCandidates(tool: string, content: unknown): Candidate[] {
  const c = content as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return [];
  const out: Candidate[] = [];
  const venue = (v: Record<string, unknown>) => {
    if (typeof v.id !== "string" || typeof v.name !== "string") return;
    out.push({
      kind: "venue",
      id: v.id,
      name: v.name,
      area: String(v.area ?? ""),
      type: String(v.type ?? ""),
      price: priceText(v.price),
      ...(v.open === "open" ? { open: "Open then" } : v.open === "closed" ? { open: "Closed then" } : {}),
    });
  };
  if (tool === "search_venues" && Array.isArray(c.venues)) (c.venues as Record<string, unknown>[]).forEach(venue);
  if (tool === "get_venue" && c.found) venue(c);
  if (tool === "search_events") {
    for (const e of (c.events ?? []) as Record<string, unknown>[]) {
      const dates = Array.isArray(e.dates) ? (e.dates as string[]) : [];
      out.push({
        kind: "event",
        title: String(e.title ?? ""),
        venueId: typeof e.venue_id === "string" ? e.venue_id : null,
        venue: typeof e.venue === "string" ? e.venue : null,
        when: [dates[0], e.starts ? clock(String(e.starts)) : null].filter(Boolean).join(", ") || null,
        price: typeof e.price === "string" && e.price !== "not recorded" ? e.price.replace(", per the listing", "") : null,
      });
    }
    for (const n of (c.weekly_nights ?? []) as Record<string, unknown>[]) {
      if (typeof n.venue_id === "string" && typeof n.venue === "string") {
        out.push({ kind: "night", venueId: n.venue_id, venue: n.venue, night: String(n.night ?? "") });
      }
    }
  }
  if (tool === "search_films") {
    for (const f of (c.films ?? []) as Record<string, unknown>[]) {
      const showings = Array.isArray(f.showings) ? (f.showings as string[]) : [];
      out.push({ kind: "film", title: String(f.title ?? ""), cinema: typeof f.cinema === "string" ? f.cinema : null, showing: showings[0] ?? null });
    }
  }
  if (tool === "search_menu_items" && Array.isArray(c.matches)) {
    for (const m of c.matches as Record<string, unknown>[]) {
      if (typeof m.venue_id === "string" && typeof m.venue === "string") {
        // The dish they asked about and its price, on the place's card (13 Nov 2026).
        const item = (Array.isArray(m.items) ? (m.items as { name?: string; price_ghs?: number }[]) : [])[0];
        const dish = item?.name && item.price_ghs != null ? `${item.name} · GHS ${item.price_ghs}` : null;
        out.push({ kind: "venue", id: m.venue_id, name: m.venue, area: String(m.area ?? ""), type: "", price: dish });
      }
    }
  }
  if (tool === "ghana_guide" && Array.isArray(c.facts)) {
    for (const f of c.facts as Record<string, unknown>[]) {
      if (typeof f.title !== "string" || typeof f.fact !== "string") continue;
      out.push({ kind: "fact", title: f.title, fact: f.fact, topic: String(f.topic ?? ""), source: String(f.source ?? ""), url: typeof f.source_url === "string" ? f.source_url : null });
    }
  }
  return out;
}

/** "19:30" as "7:30pm". */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** The ways a name is written in a reply: whole, or without "- Osu" or "(main branch)". */
function namesOf(name: string): string[] {
  const whole = fold(name).replace(/\s+/g, " ").trim();
  const short = whole.split(/\s+[-–|]\s+|\s*\(/)[0].trim();
  return [...new Set([whole, short])].filter((n) => n.length >= 4);
}

type Fact = Extract<Candidate, { kind: "fact" }>;

/** Phone numbers in a fact: Ghana's short emergency codes and full numbers. */
function phonesIn(fact: Fact): string[] {
  const full = fact.fact.match(/\+233[\d ]{8,13}\d/g) ?? [];
  // Short codes only outside full numbers: "+233 59 185 4221" is not a call to 185.
  const rest = full.reduce((t, n) => t.replace(n, " "), fact.fact);
  const short = fact.topic === "emergency" ? (rest.match(/\b(1\d{2}|18555)\b/g) ?? []) : [];
  return [...new Set([...short, ...full.map((n) => n.replace(/\s+/g, " ").trim())])].slice(0, 3);
}

/*
 * The guide facts the reply actually used: one whose figures (a fee, a
 * number to call) appear in it, or two words of its title. The model
 * rewords facts, so names cannot be matched the way places are.
 */
const GENERIC = new Set(["ghana", "accra", "police", "service", "main", "your", "with", "from"]);

export function usedFacts(text: string, candidates: Candidate[]): Fact[] {
  const said = fold(text).toLowerCase();
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const c of candidates) {
    if (c.kind !== "fact" || seen.has(c.title)) continue;
    // Whole figures only: "185" inside "18555" is not a match.
    const figures = (c.fact.match(/\d[\d,.]*\d|\d{2,}/g) ?? []).filter((n) => n.length >= 2);
    const whole = (n: string) => new RegExp(`(^|[^0-9])${n.replace(/[.,]/g, "\\$&")}([^0-9]|$)`).test(said);
    const titleWords = fold(c.title).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
    // A fact with figures is used when its figures are; one without, when its title is.
    const hits = figures.length ? figures.some(whole) : titleWords.length > 0 && titleWords.filter((w) => said.includes(w)).length >= Math.min(2, titleWords.length);
    if (hits) {
      seen.add(c.title);
      out.push(c);
    }
  }
  return out.slice(0, 4);
}

/** A fact as a card: no picture, its topic for the icon, its source and its numbers. */
export function factCard(f: Fact): ChatCard {
  const first = f.source.split("; ")[0] ?? "";
  return {
    kind: "fact",
    title: f.title,
    subtitle: first.length > 70 ? `${first.slice(0, 67)}...` : first,
    detail: f.fact.length > 240 ? `${f.fact.slice(0, 237)}...` : f.fact,
    image_url: null,
    venue_id: null,
    lat: null,
    lng: null,
    date: null,
    start: null,
    link: f.url,
    topic: f.topic,
    phones: phonesIn(f),
  };
}

const keyOf = (c: Candidate) => (c.kind === "venue" ? c.id : c.kind === "night" ? `night:${c.venueId}` : `${c.kind}:${c.title.toLowerCase()}`);
const nameOf = (c: Candidate) => (c.kind === "venue" ? c.name : c.kind === "night" ? c.venue : c.kind === "fact" ? c.title : c.title);

/** The candidates the reply names, in the order it names them. */
export function namedIn(text: string, all: Candidate[]): Candidate[] {
  const candidates = all.filter((c) => c.kind !== "fact");
  // Accents aside, so a reply that writes "A La Lune" still finds "À La Lune".
  const said = fold(text).replace(/\*+/g, "");
  const found = new Map<string, { at: number; c: Candidate }>();
  for (const c of candidates) {
    const at = Math.min(...namesOf(nameOf(c)).map((n) => said.indexOf(n)).filter((i) => i >= 0));
    if (!Number.isFinite(at)) continue;
    const key = keyOf(c);
    // An event and a weekly night at one venue both match its name: the event is the more particular.
    if (!found.has(key) || found.get(key)!.at > at) found.set(key, { at, c });
  }
  const ordered = [...found.values()].sort((a, b) => a.at - b.at).map((x) => x.c);
  // A venue already shown through its event is not shown again as a plain venue.
  const eventVenues = new Set(ordered.flatMap((c) => (c.kind === "event" && c.venueId ? [c.venueId] : [])));
  return ordered.filter((c) => !(c.kind === "venue" && eventVenues.has(c.id))).slice(0, MAX_CARDS);
}

/** Pictures, places and times for the named candidates, as cards. */
export async function buildCards(db: SupabaseClient, picked: Candidate[]): Promise<ChatCard[]> {
  if (!picked.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const venueIds = [
    ...new Set(
      picked.flatMap((c) => (c.kind === "venue" ? [c.id] : (c.kind === "event" || c.kind === "night") && c.venueId ? [c.venueId] : []))
    ),
  ];
  const eventTitles = picked.filter((c) => c.kind === "event").map((c) => (c as { title: string }).title);
  const [{ data: venueRows }, { data: eventRows }, films] = await Promise.all([
    venueIds.length
      ? db.from("venues").select("id, name, type, image_url, lat, lng, areas(name)").in("id", venueIds)
      : Promise.resolve({ data: [] }),
    eventTitles.length
      ? db
          .from("events")
          .select("title, venue_id, event_date, start_time, image_url, booking_url")
          .eq("is_active", true)
          .gte("event_date", today)
          .in("title", eventTitles)
          .order("event_date")
      : Promise.resolve({ data: [] }),
    picked.some((c) => c.kind === "film")
      ? listShowtimes(today, new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)).catch(() => [])
      : Promise.resolve([]),
  ]);
  type V = { id: string; name: string; type: string; image_url: string | null; lat: number | null; lng: number | null; areas: { name: string } | null };
  const venues = new Map(((venueRows ?? []) as unknown as V[]).map((v) => [v.id, v]));
  type E = { title: string; venue_id: string | null; event_date: string; start_time: string | null; image_url: string | null; booking_url: string | null };
  const events = (eventRows ?? []) as E[];

  return picked.flatMap((c): ChatCard[] => {
    if (c.kind === "fact") return [factCard(c)];
    if (c.kind === "venue") {
      const v = venues.get(c.id);
      return [
        {
          kind: "venue",
          title: c.name,
          subtitle: [c.area || v?.areas?.name, TYPE_LABEL[c.type || v?.type || ""]].filter(Boolean).join(" · "),
          detail: [c.price, c.open].filter(Boolean).join(" · ") || null,
          image_url: v?.image_url ?? null,
          venue_id: c.id,
          lat: v?.lat == null ? null : Number(v.lat),
          lng: v?.lng == null ? null : Number(v.lng),
          date: null,
          start: null,
          link: null,
        },
      ];
    }
    if (c.kind === "event" || c.kind === "night") {
      const v = c.venueId ? venues.get(c.venueId) : undefined;
      const e = c.kind === "event" ? events.find((x) => x.title === c.title && (!c.venueId || x.venue_id === c.venueId)) : undefined;
      return [
        {
          kind: "event",
          // Listings arrive as "untitled 04: Halloween Special" or in capitals; shown tidied.
          title: c.kind === "event" ? tidyName(c.title) : c.night,
          subtitle: [c.venue ?? v?.name, c.kind === "event" ? c.when : v?.areas?.name].filter(Boolean).join(" · "),
          detail: c.kind === "event" ? c.price : null,
          image_url: e?.image_url ?? v?.image_url ?? null,
          venue_id: c.venueId,
          lat: v?.lat == null ? null : Number(v.lat),
          lng: v?.lng == null ? null : Number(v.lng),
          date: e?.event_date ?? null,
          start: e?.start_time ? e.start_time.slice(0, 5) : null,
          link: e?.booking_url ?? null,
        },
      ];
    }
    const showing = (films as { title: string; poster_url: string | null; film_url: string | null; show_date: string; show_time: string | null; venue_id: string | null }[]).find(
      (f) => f.title.toLowerCase() === c.title.toLowerCase()
    );
    return [
      {
        kind: "film",
        title: c.title,
        subtitle: c.cinema ?? "Silverbird Cinemas",
        detail: c.showing,
        image_url: showing?.poster_url ?? null,
        venue_id: showing?.venue_id ?? null,
        lat: null,
        lng: null,
        date: showing?.show_date ?? null,
        start: showing?.show_time ? showing.show_time.slice(0, 5) : null,
        link: showing?.film_url ?? null,
      },
    ];
  });
}
