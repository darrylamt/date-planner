import { ghs } from "./format";
import type { Itinerary, StopAlternate } from "./types";

/**
 * Swap one stop for its next runner-up, locally.
 *
 * The planner already chose the alternates and priced each one against what
 * was left of the budget, so a swap needs no model call and no round trip —
 * it used to cost a full generation on every tap. The old venue rotates to the
 * back of the queue rather than being dropped, so tapping repeatedly cycles
 * the options and can always get back to where it started.
 *
 * Shared by both clients so the arithmetic and the wording cannot drift apart.
 */
export interface SwapResult {
  itinerary: Itinerary;
  message: string;
}

export function swapStopLocally(
  itinerary: Itinerary,
  index: number,
  budget: number
): SwapResult | null {
  const stop = itinerary.stops[index];
  if (!stop) return null;

  const alternates = stop.alternates ?? [];
  if (!alternates.length) return null;

  const next = alternates[0];
  const rotated: StopAlternate[] = [
    ...alternates.slice(1),
    {
      venue_id: stop.venue_id,
      name: stop.name,
      area: stop.area,
      image_url: stop.image_url,
      google_maps_url: stop.google_maps_url ?? null,
      reservation_required: stop.reservation_required ?? false,
      orders: stop.orders,
      est_cost_ghs: stop.est_cost_ghs,
      why_this_fits: stop.why_this_fits,
    },
  ];

  const swapped = {
    ...stop,
    venue_id: next.venue_id,
    name: next.name,
    area: next.area,
    image_url: next.image_url,
    google_maps_url: next.google_maps_url,
    reservation_required: next.reservation_required,
    reservation_requested: false,
    orders: next.orders,
    est_cost_ghs: next.est_cost_ghs,
    why_this_fits: next.why_this_fits,
    alternates: rotated,
  };

  const stops = itinerary.stops.map((s, i) => (i === index ? swapped : s));
  const food = Math.round(stops.reduce((sum, s) => sum + Number(s.est_cost_ghs), 0));
  const est = Math.round(food + Number(itinerary.transport_total_ghs));

  /*
   * Transport is carried over rather than recalculated: the hop model lives on
   * the server and the client has no distances. That is fine while the swap
   * stays in the same area, and misleading once it does not — so a move across
   * town says the total may shift instead of quoting a figure it cannot stand
   * behind.
   */
  const areaChanged = Boolean(next.area && stop.area && next.area !== stop.area);
  const buffer = budget - est;

  const message = areaChanged
    ? `Swapped to ${next.area} — transport will change, so the total is approximate.`
    : buffer >= 0
      ? `Swapped — still ${ghs(buffer)} under budget`
      : `Swapped — now ${ghs(Math.abs(buffer))} over budget`;

  return {
    itinerary: {
      ...itinerary,
      stops,
      summary_route: Array.from(
        new Set(stops.map((s) => s.area).filter(Boolean))
      ).join(" → "),
      food_total_ghs: food,
      est_total_ghs: est,
    },
    message,
  };
}
