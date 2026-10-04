import { ghs } from "./format";
import type { Itinerary, StopAlternate, VenueType } from "./types";

/**
 * A heading by what kind of place it is, in the planner's own words
 * (TYPE_LABEL in planner.ts), for an alternate saved before alternates
 * carried their heading.
 */
const KIND_LABEL: Record<VenueType, string> = {
  restaurant: "A TABLE",
  lounge: "DRINKS",
  cafe: "COFFEE",
  dessert: "DESSERT",
  activity: "SOMETHING TO DO",
  outdoor: "OUTDOORS",
  wellness: "SPA",
};

/**
 * Swap one stop for its next runner-up, locally.
 *
 * The planner already chose the alternates and priced each one against what
 * was left of the budget, so a swap needs no model call and no round trip,
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
      venue_type: stop.venue_type,
      name: stop.name,
      area: stop.area,
      image_url: stop.image_url,
      images: stop.images,
      instagram_handle: stop.instagram_handle ?? null,
      google_maps_url: stop.google_maps_url ?? null,
      lat: stop.lat ?? null,
      lng: stop.lng ?? null,
      reservation_required: stop.reservation_required ?? false,
      orders: stop.orders,
      charges: stop.charges,
      charge_rates: stop.charge_rates ?? null,
      est_cost_ghs: stop.est_cost_ghs,
      why_this_fits: stop.why_this_fits,
      // Its own words, label and event, so cycling back restores the stop whole.
      label: stop.label,
      what_to_do: stop.what_to_do,
      whats_on: stop.whats_on,
      event: stop.event,
    },
  ];

  const swapped = {
    ...stop,
    venue_id: next.venue_id,
    venue_type: next.venue_type,
    name: next.name,
    area: next.area,
    image_url: next.image_url,
    // Falls back to the single hero for a plan saved before galleries existed,
    // so an old itinerary swaps to one picture rather than to none.
    images: next.images ?? (next.image_url ? [next.image_url] : []),
    instagram_handle: next.instagram_handle ?? null,
    google_maps_url: next.google_maps_url,
    lat: next.lat ?? null,
    lng: next.lng ?? null,
    reservation_required: next.reservation_required,
    reservation_requested: false,
    orders: next.orders,
    // The new venue's charges, never the old one's.
    charges: next.charges ?? [],
    charge_rates: next.charge_rates ?? null,
    est_cost_ghs: next.est_cost_ghs,
    why_this_fits: next.why_this_fits,
    /*
     * Everything on the card that belonged to the old venue goes with it.
     * A swap kept the old stop's event, written lines and "what's on", so a
     * card swapped away from an event still carried the event's title and
     * description over the new venue's pictures and prices. An alternate the
     * planner made has none of its own: no event, no lines, and the slot's
     * label unless the old one was the event's.
     */
    event: next.event,
    what_to_do: next.what_to_do ?? "",
    whats_on: next.whats_on ?? [],
    /*
     * The heading changes with everything else. A restaurant swapped into a
     * "SOMETHING TO DO" slot kept that heading. The planner now sends each
     * alternate's own; an older plan has none, so a different kind of place
     * takes its kind's heading, and only a like-for-like swap keeps the slot's.
     * Never the event's own heading on a venue that is not the event.
     */
    label:
      next.label ??
      (next.venue_type && (stop.event || next.venue_type !== stop.venue_type)
        ? KIND_LABEL[next.venue_type]
        : stop.event
          ? "NEXT STOP"
          : stop.label),
    alternates: rotated,
  };

  const stops = itinerary.stops.map((s, i) => (i === index ? swapped : s));
  const food = Math.round(stops.reduce((sum, s) => sum + Number(s.est_cost_ghs), 0));
  const est = Math.round(food + Number(itinerary.transport_total_ghs));

  /*
   * Transport is carried over rather than recalculated: the hop model lives on
   * the server and the client has no distances. That is fine while the swap
   * stays in the same area, and misleading once it does not, so a move across
   * town says the total may shift instead of quoting a figure it cannot stand
   * behind.
   */
  const areaChanged = Boolean(next.area && stop.area && next.area !== stop.area);
  const buffer = budget - est;

  const message = areaChanged
    ? `Swapped to ${next.area}, transport will change, so the total is approximate.`
    : buffer >= 0
      ? `Swapped, still ${ghs(buffer)} under budget`
      : `Swapped, now ${ghs(Math.abs(buffer))} over budget`;

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
