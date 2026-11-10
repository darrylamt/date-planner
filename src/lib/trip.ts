import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCandidates } from "./matching";
import { planItinerary } from "./planner";
import { assembleItinerary } from "./itinerary";
import { fallbackCopy } from "./copy";
import { defaultInputs } from "./planConstants";
import { planInputsSchema } from "./schemas";
import { haversineKm } from "./transport";
import { CITY_CENTRES } from "./neighbourhoods";
import { BUDGET_MAX } from "./budget";
import { fetchAllRows } from "./fetchAll";
import { photoCredit, routesTo, type Destination, type IntercityRoute, type TravelMode } from "./trips";
import type { Itinerary, PlanInputs } from "./types";

/**
 * A trip within Ghana (the Trips plan, 25 Oct 2026): how to get there,
 * where to stay, each day planned, how to get back, and what it comes to.
 *
 * Everything is the catalogue's own: ways there from intercity_routes (0101),
 * stays with their rooms (0099), and each day from the one-day planner run
 * round the stay. Where something is missing the trip says so in `gaps`
 * rather than filling it, so a trip to somewhere we are still building is
 * still useful (the ways there, the sights) and honest about the rest.
 */

export const COMFORTS = ["easy", "mid", "treat"] as const;
export type Comfort = (typeof COMFORTS)[number];

/**
 * What four hours out is planned to cost a head at each comfort: the budget
 * the one-day planner is asked to fit, not a price. Mid is the app's own
 * start for a night out with friends (planConstants, GHS 400 each), and each
 * part of the trip asks for its hours' share: a full day about twice that.
 */
/*
 * What four hours out costs a head at each comfort, the budget each part of a
 * day is planned to. Raised 10 Nov 2026 (was 250 / 400 / 700): outside Accra
 * most meals are estimates budgeted at the top of their band, and the rides
 * between a stay and the sights are longer, so 400 a head fitted no evening
 * in Takoradi. The plan still shows what it actually comes to.
 */
const PER_HEAD_4H: Record<Comfort, number> = { easy: 350, mid: 600, treat: 1000 };

export const tripInputsSchema = z.object({
  to: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
  from: z.string().trim().min(2).max(80).default("Accra"),
  arrive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nights: z.number().int().min(1).max(14),
  partySize: z.number().int().min(1).max(20),
  comfort: z.enum(COMFORTS).default("mid"),
  travel: z.enum(["any", "bus", "trotro", "car", "flight", "ferry"]).default("any"),
  vibes: z.array(z.string().max(60)).max(3).default([]),
});
export type TripInputs = z.infer<typeof tripInputsSchema>;

export interface Range {
  min: number;
  /** Null for a "from" figure, where only the lowest is known. */
  max: number | null;
}

export interface TripWay {
  id: string;
  mode: TravelMode;
  operator: string;
  service: string | null;
  from: string;
  to: string;
  departures: string | null;
  minutes: number | null;
  fromStation: string | null;
  toStation: string | null;
  bookUrl: string | null;
  bookPhone: string | null;
  checkedOn: string | null;
  notes: string | null;
  /** A car is paid per vehicle; everything else per seat. */
  perVehicle: boolean;
  /** One way, for the whole party. Null when nobody knows the fare. */
  oneWay: Range | null;
  /** Both ways, where the fare holds back too; else null. */
  return: Range | null;
}

export interface TripStay {
  id: string;
  name: string;
  kind: string | null;
  town: string | null;
  image: string | null;
  phone: string | null;
  whatsapp: string | null;
  bookingUrl: string | null;
  lat: number | null;
  lng: number | null;
  checkIn: string | null;
  checkOut: string | null;
  room: { name: string; sleeps: number; nightly: number; breakfast: boolean } | null;
  rooms: number;
  /** Every night, every room, at the rates on record (weekend rates on Friday and Saturday nights). */
  total: number | null;
  ratesCheckedOn: string | null;
}

/** A stretch of a day the one-day planner fills on its own: an afternoon, an evening, a morning. */
export interface TripPart {
  label: string;
  startTime: string;
  hours: number;
  itinerary: Itinerary | null;
  note: string | null;
}

export interface TripDay {
  date: string;
  label: string;
  parts: TripPart[];
}

export interface TripSight {
  id: string;
  name: string;
  type: string;
  description: string | null;
  image: string | null;
  mapsUrl: string | null;
  /** Entry a head, 0 for free, null when nobody has recorded it. */
  fee: number | null;
  chargesNote: string | null;
}

export interface Trip {
  destination: {
    slug: string;
    name: string;
    region: string;
    town: string | null;
    gatewayTown: string;
    lastLeg: string | null;
    image: string | null;
    imageCredit: string | null;
    blurb: string | null;
    highlights: string[];
  };
  inputs: TripInputs;
  leave: string;
  ways: TripWay[];
  chosenWay: string | null;
  stays: TripStay[];
  /** Places to stay near it with no rates on record: named, with a number to ask. */
  askForRates: Pick<TripStay, "id" | "name" | "phone" | "whatsapp" | "bookingUrl">[];
  days: TripDay[];
  sights: TripSight[];
  totals: { travel: Range | null; stay: number | null; days: number; total: Range; complete: boolean };
  gaps: string[];
  ready: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const times = (r: Range | null, k: number): Range | null => (r ? { min: r.min * k, max: r.max == null ? null : r.max * k } : null);
const plus = (a: Range, b: Range | null): Range => (b ? { min: a.min + b.min, max: a.max == null || b.max == null ? null : a.max + b.max } : a);

/** One way, for the party, from a route's fares: a range, a "from" figure, or nothing known. */
function partyFare(r: IntercityRoute, party: number): Range | null {
  const lo = r.fare_min_ghs == null ? null : Number(r.fare_min_ghs);
  const hi = r.fare_max_ghs == null ? null : Number(r.fare_max_ghs);
  if (lo == null && hi == null) return null;
  const k = r.mode === "car" ? 1 : party;
  return { min: (lo ?? hi!) * k, max: hi == null ? null : hi * k };
}

/**
 * Each day in parts the one-day planner is tuned for, about four hours
 * each: the arrival evening, full days as an afternoon from lunch and an
 * evening from dinner, and the last morning before the journey back.
 * Planned as one nine-hour stretch, a Kumasi day came back as three
 * restaurants in four hours, and the search took over a minute; in parts
 * each meal has its own place (owner: meals must be intentional).
 * Breakfast is at the stay. A flight lands early enough to add an afternoon.
 */
function dayShapes(arrive: string, nights: number, flying: boolean) {
  const out: { date: string; label: string; parts: { label: string; startTime: string; hours: number }[] }[] = [];
  for (let i = 0; i <= nights; i++) {
    const date = addDays(arrive, i);
    if (i === 0)
      out.push({
        date,
        label: "Arrival day",
        parts: flying
          ? [
              { label: "Afternoon", startTime: "13:30", hours: 3 },
              { label: "Evening", startTime: "18:00", hours: 4 },
            ]
          : [{ label: "Evening", startTime: "17:30", hours: 4 }],
      });
    else if (i === nights) out.push({ date, label: "Last morning", parts: [{ label: "Morning", startTime: "09:00", hours: 3 }] });
    else
      out.push({
        date,
        label: `Day ${i + 1}`,
        parts: [
          { label: "Afternoon", startTime: "11:30", hours: 4 },
          { label: "Evening", startTime: "18:00", hours: 4 },
        ],
      });
  }
  return out;
}

interface StayRow {
  id: string;
  name: string;
  image_url: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  booking_url: string | null;
  lat: number | null;
  lng: number | null;
  stay_details: { kind: string | null; town: string | null; check_in: string | null; check_out: string | null; rates_checked_on: string | null } | null;
  stay_rooms: { name: string; sleeps: number; price_per_night_ghs: number | null; weekend_price_ghs: number | null; breakfast_included: boolean; is_active: boolean }[];
}

/** A stay's best room for the party: the fewest cedis for everybody, every night. */
function fitRoom(s: StayRow, party: number, nightDates: string[]): Pick<TripStay, "room" | "rooms" | "total"> {
  let best: Pick<TripStay, "room" | "rooms" | "total"> | null = null;
  for (const r of s.stay_rooms) {
    if (!r.is_active || r.price_per_night_ghs == null || !r.sleeps) continue;
    const rooms = Math.ceil(party / r.sleeps);
    const nightly = Number(r.price_per_night_ghs);
    const total = nightDates.reduce((sum, d) => {
      const weekend = weekday(d) === 5 || weekday(d) === 6;
      return sum + rooms * (weekend && r.weekend_price_ghs != null ? Number(r.weekend_price_ghs) : nightly);
    }, 0);
    if (!best || total < (best.total ?? Infinity)) {
      best = { room: { name: r.name, sleeps: r.sleeps, nightly, breakfast: r.breakfast_included }, rooms, total: Math.round(total) };
    }
  }
  return best ?? { room: null, rooms: 0, total: null };
}

/**
 * The town whose areas hold the places near a destination, so the one-day
 * planner searches the right ones: Wli's waterfall is filed under Ho, Elmina
 * under Cape Coast. The most common among the places within its radius,
 * else the nearest of our towns.
 */
function plannerCity(d: Destination, near: { city: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const v of near) if (v.city) counts.set(v.city, (counts.get(v.city) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return top;
  const at = { lat: Number(d.lat), lng: Number(d.lng) };
  return Object.entries(CITY_CENTRES).sort((a, b) => haversineKm(at, a[1]) - haversineKm(at, b[1]))[0][0];
}

interface PlaceRow {
  id: string;
  name: string;
  type: string;
  lat: number | null;
  lng: number | null;
  description: string | null;
  image_url: string | null;
  google_maps_url: string | null;
  entry_fee_ghs: number | null;
  is_free: boolean;
  charges_note: string | null;
  areas: { city: string | null } | null;
}

export class UnknownDestination extends Error {}

/** What /api/trip/generate answers. */
export type TripResponse =
  | { status: "ok"; trip: Trip }
  | { status: "error"; message: string }
  /** A free account's trip this month is used (/api/trip/generate); Pro plans any number and changes them. */
  | { status: "limit"; message: string };

/**
 * Build a trip. `db` reads as the server: stays are hidden from anybody else
 * until Trips is public (0099), and the trip tables have no public read
 * (0101). The one-day planner filters closed places and stays itself.
 */
export async function buildTrip(db: SupabaseClient, inputs: TripInputs): Promise<Trip> {
  const { data: destRow } = await db.from("destinations").select("*").eq("slug", inputs.to).eq("is_active", true).maybeSingle();
  if (!destRow) throw new UnknownDestination(inputs.to);
  const d = destRow as Destination;
  const here = d.lat != null && d.lng != null ? { lat: Number(d.lat), lng: Number(d.lng) } : null;
  const radius = Number(d.radius_km);
  const within = (p: { lat: number | null; lng: number | null }, km = radius) =>
    here != null && p.lat != null && p.lng != null && haversineKm(here, { lat: Number(p.lat), lng: Number(p.lng) }) <= km;
  const party = inputs.partySize;
  const leave = addDays(inputs.arrive, inputs.nights);
  const gaps: string[] = [];

  const [routesRes, staysRaw, placesRaw] = await Promise.all([
    db.from("intercity_routes").select("*").eq("is_active", true),
    fetchAllRows<Record<string, unknown>>((a, b) =>
      db
        .from("venues")
        .select(
          "id, name, image_url, phone, whatsapp_phone, booking_url, lat, lng, stay_details(kind, town, check_in, check_out, rates_checked_on), stay_rooms(name, sleeps, price_per_night_ghs, weekend_price_ghs, breakfast_included, is_active)"
        )
        .eq("type", "stay")
        .eq("is_active", true)
        .order("id")
        .range(a, b)
    ),
    fetchAllRows<Record<string, unknown>>(
      (a, b) =>
        db
          .from("venues")
          .select("id, name, type, lat, lng, description, image_url, google_maps_url, entry_fee_ghs, is_free, charges_note, areas(city)")
          .eq("is_active", true)
          .neq("type", "stay")
          .order("id")
          .range(a, b)
    ),
  ]);
  // A stay's details are one row (venue_id is its key), embedded as an object.
  const staysRows = staysRaw as unknown as StayRow[];
  const placeRows = placesRaw as unknown as PlaceRow[];

  // ── getting there ────────────────────────────────────────────────────
  const from = inputs.from.toLowerCase();
  const ways: TripWay[] = routesTo(d, (routesRes.data ?? []) as IntercityRoute[])
    .filter((r) => r.from_town.toLowerCase() === from || (r.both_ways && r.to_town.toLowerCase() === from))
    .map((r) => {
      const oneWay = partyFare(r, party);
      // Read the right way round for this trip whichever way it was entered.
      const outbound = r.from_town.toLowerCase() === from;
      return {
        id: r.id,
        mode: r.mode,
        operator: r.operator,
        service: r.service || null,
        from: outbound ? r.from_town : r.to_town,
        to: outbound ? r.to_town : r.from_town,
        departures: r.departures,
        minutes: r.duration_mins,
        fromStation: outbound ? r.from_station : r.to_station,
        toStation: outbound ? r.to_station : r.from_station,
        bookUrl: r.book_url,
        bookPhone: r.book_phone,
        checkedOn: r.checked_on,
        notes: r.notes,
        perVehicle: r.mode === "car",
        oneWay,
        return: r.both_ways ? times(oneWay, 2) : null,
      };
    })
    .sort((a, b) => (a.oneWay?.min ?? Infinity) - (b.oneWay?.min ?? Infinity));
  const priced = ways.filter((w) => w.oneWay);
  const chosen =
    (inputs.travel !== "any" ? ways.find((w) => w.mode === inputs.travel && w.oneWay) ?? ways.find((w) => w.mode === inputs.travel) : null) ??
    priced[0] ??
    ways[0] ??
    null;
  if (!ways.length) gaps.push(`We don't have a way from ${inputs.from} to ${d.gateway_town} yet.`);
  else if (inputs.travel !== "any" && chosen?.mode !== inputs.travel) gaps.push(`We don't have a ${inputs.travel} to ${d.gateway_town} yet, so this uses the ${chosen?.mode}.`);
  if (chosen && !chosen.oneWay) gaps.push(`${chosen.operator} doesn't publish fares: ask when you book.`);
  if (chosen && !chosen.return) gaps.push(`The way back isn't in the total: we only have ${chosen.operator}'s fare one way.`);
  if (d.last_leg && d.gateway_town !== (d.town ?? d.name)) gaps.push(`From ${d.gateway_town}: ${d.last_leg.charAt(0).toLowerCase()}${d.last_leg.slice(1)}. Not in the total.`);

  // ── where to stay ────────────────────────────────────────────────────
  const townNames = new Set([d.town, d.gateway_town, d.name].filter(Boolean).map((t) => t!.toLowerCase()));
  const nightDates = Array.from({ length: inputs.nights }, (_, i) => addDays(inputs.arrive, i));
  const nearStays = staysRows.filter((s) => within(s) || townNames.has(String(s.stay_details?.town ?? "").toLowerCase()));
  const fitted = nearStays.map((s) => ({ s, fit: fitRoom(s, party, nightDates) }));
  const withRates = fitted.filter((x) => x.fit.total != null).sort((a, b) => a.fit.total! - b.fit.total!);
  // Easy starts from the cheapest, treat from the dearest, mid from the middle.
  const order =
    inputs.comfort === "treat"
      ? [...withRates].reverse()
      : inputs.comfort === "mid"
        ? [...withRates].sort((a, b) => Math.abs(a.fit.total! - withRates[Math.floor(withRates.length / 2)].fit.total!) - Math.abs(b.fit.total! - withRates[Math.floor(withRates.length / 2)].fit.total!))
        : withRates;
  const stays: TripStay[] = order.slice(0, 3).map(({ s, fit }) => ({
    id: s.id,
    name: s.name,
    kind: s.stay_details?.kind ?? null,
    town: s.stay_details?.town ?? null,
    image: s.image_url,
    phone: s.phone,
    whatsapp: s.whatsapp_phone,
    bookingUrl: s.booking_url,
    lat: s.lat == null ? null : Number(s.lat),
    lng: s.lng == null ? null : Number(s.lng),
    checkIn: s.stay_details?.check_in ?? null,
    checkOut: s.stay_details?.check_out ?? null,
    ...fit,
    ratesCheckedOn: s.stay_details?.rates_checked_on ?? null,
  }));
  const askForRates = fitted
    .filter((x) => x.fit.total == null)
    .slice(0, 5)
    .map(({ s }) => ({ id: s.id, name: s.name, phone: s.phone, whatsapp: s.whatsapp_phone, bookingUrl: s.booking_url }));
  if (!stays.length) gaps.push(askForRates.length ? `Places to stay near ${d.name} haven't given us their rates yet.` : `We don't have places to stay in ${d.name} yet.`);

  // ── each day ─────────────────────────────────────────────────────────
  const places = placeRows.map((v) => ({ ...v, city: v.areas?.city ?? null }));
  const nearPlaces = places.filter((v) => within(v));
  const city = plannerCity(d, nearPlaces);
  const base = stays[0]?.lat != null && stays[0]?.lng != null ? { lat: stays[0].lat!, lng: stays[0].lng! } : here;
  const flying = chosen?.mode === "flight";
  const shapes = dayShapes(inputs.arrive, inputs.nights, flying);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const inputsFor = (date: string, startTime: string, hours: number) =>
    planInputsSchema.parse({
      ...defaultInputs(),
      city,
      near: base ?? undefined,
      radiusKm: Math.min(20, Math.max(3, radius)),
      partySize: party,
      budget: Math.min(BUDGET_MAX, Math.round((PER_HEAD_4H[inputs.comfort] * party * hours) / 4)),
      date,
      startTime,
      hours,
      // Two stops a part outside Accra, a meal and a sight or activity: travel days are slower, and towns hold fewer places (10 Nov 2026).
      stops: city !== "Accra" ? 2 : 0,
      vibes: inputs.vibes,
      occasion: party === 1 ? "solo_day" : "friend_outing",
      ai: false,
      /*
       * Outside Accra few places publish a menu, so a trip day there may use a
       * place to eat or drink at its price band's estimate, labelled as one,
       * the way the "places without menus" switch does for outings (owner,
       * 10 Nov 2026). Accra has menus enough to keep to real prices.
       */
      estimates: city !== "Accra",
    }) as PlanInputs;
  /*
   * One shortlist a date, covering all its parts, read for every date at
   * once (each is several queries). Each part is then planned in order from
   * its date's list, less what earlier parts used, so no place comes twice;
   * the planner checks each part's own opening hours.
   */
  const shortlists = base
    ? await Promise.all(
        shapes.map((shape) => {
          const first = shape.parts[0];
          const last = shape.parts[shape.parts.length - 1];
          const span = (toMin(last.startTime) + last.hours * 60 - toMin(first.startTime)) / 60;
          return fetchCandidates(db, inputsFor(shape.date, first.startTime, Math.min(12, span))).catch((e) => {
            console.error("trip day shortlist failed", d.slug, shape.date, e);
            return null;
          });
        })
      )
    : shapes.map(() => null);
  const used = new Set<string>();
  const days: TripDay[] = shapes.map((shape, i) => ({
    date: shape.date,
    label: shape.label,
    parts: shape.parts.map((part) => {
      const pi = inputsFor(shape.date, part.startTime, part.hours);
      const list = shortlists[i];
      let itinerary: Itinerary | null = null;
      if (list) {
        const candidates = { ...list, venues: list.venues.filter((v) => !used.has(v.id)) };
        try {
          const plan = candidates.venues.length ? planItinerary(pi, candidates) : null;
          if (plan) {
            itinerary = assembleItinerary(pi, plan, fallbackCopy(pi, plan));
            itinerary.title = `${shape.label}, ${part.label.toLowerCase()}`;
            for (const s of itinerary.stops) used.add(s.venue_id);
          }
        } catch (e) {
          console.error("trip part failed", d.slug, shape.date, part.label, e);
        }
      }
      return { ...part, itinerary, note: itinerary ? null : `Not enough places with prices near ${d.name} for this yet.` };
    }),
  }));
  const parts = days.flatMap((x) => x.parts);
  const unplanned = parts.filter((x) => !x.itinerary).length;
  if (unplanned) gaps.push(unplanned === parts.length ? `We can't plan the days in ${d.name} yet: too few places there have prices.` : `${unplanned} of the ${parts.length} parts of the trip couldn't be planned: too few places near ${d.name} have prices.`);

  // ── worth seeing ─────────────────────────────────────────────────────
  const sights: TripSight[] = nearPlaces
    .filter((v) => (v.type === "activity" || v.type === "outdoor") && !used.has(v.id))
    .sort((a, b) => Number(b.entry_fee_ghs != null) - Number(a.entry_fee_ghs != null))
    .slice(0, 8)
    .map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      description: v.description || null,
      image: v.image_url,
      mapsUrl: v.google_maps_url,
      fee: v.entry_fee_ghs == null ? (v.is_free ? 0 : null) : Number(v.entry_fee_ghs),
      chargesNote: v.charges_note,
    }));

  // ── what it comes to ─────────────────────────────────────────────────
  const travel = chosen ? (chosen.return ?? chosen.oneWay) : null;
  const stay = stays[0]?.total ?? null;
  const dayTotal = Math.round(parts.reduce((sum, x) => sum + (x.itinerary?.est_total_ghs ?? 0), 0));
  const total = plus({ min: (stay ?? 0) + dayTotal, max: (stay ?? 0) + dayTotal }, travel);
  const complete = Boolean(chosen?.return) && stay != null && !unplanned;

  return {
    destination: {
      slug: d.slug,
      name: d.name,
      region: d.region,
      town: d.town,
      gatewayTown: d.gateway_town,
      lastLeg: d.last_leg,
      image: d.hero_image,
      imageCredit: photoCredit(d),
      blurb: d.blurb,
      highlights: d.highlights ?? [],
    },
    inputs,
    leave,
    ways,
    chosenWay: chosen?.id ?? null,
    stays,
    askForRates,
    days,
    sights,
    totals: { travel, stay, days: dayTotal, total, complete },
    gaps,
    ready: priced.length > 0 && stays.length > 0 && !unplanned,
  };
}
