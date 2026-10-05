/**
 * Offline check of club-hopping door pricing: made-up clubs, no database.
 *
 *   npx tsx scripts/club-hop-check.ts
 *
 * The first bar should carry drinks; every bar after it with a recorded
 * entry should be its door alone, with the typical drink price in the note;
 * a bar whose entry is not recorded should be priced with drinks as before.
 */
import { planItinerary } from "../src/lib/planner";
import type { MenuItem, PlanInputs, Venue } from "../src/lib/types";

const AREA = "area-osu";
const club = (id: string, name: string, entry: number | null, lat: number): Venue =>
  ({
    id,
    name,
    type: "lounge",
    area_id: AREA,
    areas: { name: "Osu" },
    vibe_tags: ["dancing", "lively"],
    best_for: ["friend_outing"],
    price_band: "mid",
    avg_cost_per_person_ghs: 0,
    price_source: "menu",
    is_active: true,
    is_free: false,
    entry_fee_ghs: entry,
    lat,
    lng: -0.18,
    description: "",
    reservation_required: false,
    opening_periods: null,
  }) as unknown as Venue;

const drinks = (venue: string): MenuItem[] =>
  [
    ["Club Beer", 40],
    ["Gin & Tonic", 90],
    ["Cocktail", 120],
    ["Water", 20],
  ].map(([name, price], i) => ({
    id: `${venue}-${i}`,
    venue_id: venue,
    name: String(name),
    category: "drink",
    price_ghs: Number(price),
    covers_people: 1,
    is_alcoholic: name !== "Water",
  })) as unknown as MenuItem[];

const venues = [
  club("a", "Alley (entry free)", 0, 5.555),
  club("b", "Republic (entry 50)", 50, 5.556),
  club("c", "Shuko (entry unknown)", null, 5.557),
  club("d", "Mood (entry free)", 0, 5.558),
];

const inputs = {
  areaIds: [AREA],
  areaNames: ["Osu"],
  surpriseMe: false,
  partySize: 2,
  companions: [],
  budget: 2000,
  date: "2026-10-09",
  startTime: process.env.START ?? "21:00",
  hours: Number(process.env.HOURS ?? 5),
  stops: 4,
  vibes: [process.env.VIBE ?? "club hopping"],
  focus: "everything",
  cuisine: "either",
  formality: "casual",
  occasion: "friend_outing",
  partner: { name: "", gender: "unspecified", food: "", place: "", interests: "", avoid: "" },
} as unknown as PlanInputs;

const plan = planItinerary(inputs, {
  venues,
  menuItems: venues.flatMap((v) => drinks(v.id)),
  events: [],
  schedules: [],
  allAreaNames: ["Osu"],
  totalActiveVenues: venues.length,
} as never);

if (!plan) {
  console.log("no plan");
  process.exit(1);
}
for (const s of (plan as { stops: { venue: Venue; orders: { item: string; qty: number; price_ghs: number; note?: string | null }[]; cost: number }[] }).stops) {
  console.log(`\n${s.venue.name}  cost ${s.cost}`);
  for (const o of s.orders) console.log(`  ${o.item} x${o.qty}  GHS ${o.price_ghs}${o.note ? `  (${o.note})` : ""}`);
}
