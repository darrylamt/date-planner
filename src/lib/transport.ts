/**
 * Transport cost estimator between stops.
 * Simple distance-based estimate: GHS 25 base + GHS 8 per km when both
 * venues have lat/lng; otherwise a flat GHS 40 per hop.
 * Always surfaced to users with an "estimate" label.
 */

const BASE_GHS = 25;
const PER_KM_GHS = 8;
const FLAT_GHS = 40;

interface Point {
  lat: number | null;
  lng: number | null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estimateHop(from: Point, to: Point): { cost_ghs: number; mins: number } {
  if (from.lat != null && from.lng != null && to.lat != null && to.lng != null) {
    const km = haversineKm(
      { lat: Number(from.lat), lng: Number(from.lng) },
      { lat: Number(to.lat), lng: Number(to.lng) }
    );
    const cost = Math.round((BASE_GHS + km * PER_KM_GHS) / 5) * 5; // round to GHS 5
    const mins = Math.max(6, Math.round(km * 3 + 4)); // rough Accra traffic heuristic
    return { cost_ghs: cost, mins };
  }
  return { cost_ghs: FLAT_GHS, mins: 15 };
}
