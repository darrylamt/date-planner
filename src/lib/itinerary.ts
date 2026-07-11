import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateHop } from "./transport";
import type { Itinerary, ItineraryStop, TransportHop, Venue } from "./types";

/**
 * Server-side verification & recomputation. The model proposes stops; the
 * server owns the arithmetic: hops are recomputed from venue coordinates and
 * every total is re-derived so a plan can never quietly exceed the budget.
 */

interface Coord {
  lat: number | null;
  lng: number | null;
  areaName: string;
}

export async function coordsForStops(
  supabase: SupabaseClient,
  stops: ItineraryStop[]
): Promise<Map<string, Coord>> {
  const venueIds = stops.filter((s) => s.kind !== "event").map((s) => s.venue_id);
  const eventIds = stops.filter((s) => s.kind === "event").map((s) => s.venue_id);

  const map = new Map<string, Coord>();

  if (venueIds.length) {
    const { data } = await supabase
      .from("venues")
      .select("id, lat, lng, areas(name)")
      .in("id", venueIds);
    (data ?? []).forEach((v: any) => {
      map.set(v.id, { lat: v.lat, lng: v.lng, areaName: v.areas?.name ?? "" });
    });
  }

  if (eventIds.length) {
    // Events sit at their venue if linked, otherwise at their area (no coords → flat-rate hop).
    const { data } = await supabase
      .from("events")
      .select("id, venue_id, areas(name), venues(lat, lng)")
      .in("id", eventIds);
    (data ?? []).forEach((e: any) => {
      map.set(e.id, {
        lat: e.venues?.lat ?? null,
        lng: e.venues?.lng ?? null,
        areaName: e.areas?.name ?? "",
      });
    });
  }

  return map;
}

export function recomputeItinerary(
  itinerary: Itinerary,
  coords: Map<string, Coord>
): Itinerary {
  const stops = itinerary.stops;

  const hops: TransportHop[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = coords.get(stops[i].venue_id) ?? { lat: null, lng: null, areaName: stops[i].area };
    const b = coords.get(stops[i + 1].venue_id) ?? {
      lat: null,
      lng: null,
      areaName: stops[i + 1].area,
    };
    const est = estimateHop(a, b);
    hops.push({
      from: a.areaName || stops[i].area,
      to: b.areaName || stops[i + 1].area,
      mins: est.mins,
      cost_ghs: est.cost_ghs,
    });
  }

  const foodTotal = stops.reduce((sum, s) => {
    const orderSum = s.orders.reduce((o, x) => o + Number(x.price_ghs), 0);
    // Trust order math when present; otherwise the model's stop estimate.
    const stopCost = orderSum > 0 ? Math.max(orderSum, 0) : Number(s.est_cost_for_two_ghs);
    s.est_cost_for_two_ghs = Math.round(s.kind === "event" ? Number(s.est_cost_for_two_ghs) : stopCost);
    return sum + s.est_cost_for_two_ghs;
  }, 0);

  const transportTotal = hops.reduce((s, h) => s + h.cost_ghs, 0);

  return {
    ...itinerary,
    stops,
    hops,
    food_total_ghs: Math.round(foodTotal),
    transport_total_ghs: Math.round(transportTotal),
    est_total_ghs: Math.round(foodTotal + transportTotal),
  };
}

/** Pre-compute a pairwise hop table for the prompt so the model can plan realistically. */
export function hopTableFor(venues: Venue[]): string {
  const lines: string[] = [];
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      const est = estimateHop(venues[i], venues[j]);
      lines.push(
        `${venues[i].name} ↔ ${venues[j].name}: GHS ${est.cost_ghs} (~${est.mins} min)`
      );
    }
  }
  return lines.join("\n") || "Flat estimate: GHS 40 per hop (~15 min)";
}

/** True when every stop references a provided candidate id. */
export function stopsAreGrounded(
  stops: ItineraryStop[],
  venueIds: Set<string>,
  eventIds: Set<string>
): boolean {
  return stops.every((s) =>
    s.kind === "event" ? eventIds.has(s.venue_id) : venueIds.has(s.venue_id)
  );
}
