import { AppState } from "react-native";
import { supabase } from "./supabase";
import { getDeviceId } from "./deviceId";
import type { Itinerary } from "./types";

/**
 * What people do with the places in their plans, sent to /api/signals
 * (plan_signals, 0089): shown, swapped, saved, shared, menu opened, Book
 * tapped, time on a venue's page.
 *
 * The raw material for each venue's pull rate and, later, each person's
 * taste: the swap that used to happen on the phone and vanish is the most
 * telling thing anyone does in Duro!. About places, never a score of a
 * person; the privacy policy says Duro! learns from what people keep and swap.
 *
 * Queued and sent in batches: a few seconds after the last one, at twenty,
 * or when the app goes to the background. Never throws and never shows
 * anything: a lost signal costs nothing.
 */
export type SignalKind =
  | "shown"
  | "swapped_away"
  | "swapped_in"
  | "saved"
  | "shared"
  | "details_opened"
  | "menu_opened"
  | "book_tapped"
  | "directions_tapped"
  | "maps_opened"
  | "instagram_opened"
  | "venue_viewed";

type Pending = { kind: SignalKind; venueId: string; planKey?: string; occasion?: string; value?: number; at: string };

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function track(kind: SignalKind, venueId: string | null | undefined, extra: { planKey?: string; occasion?: string; value?: number } = {}) {
  if (!venueId || !UUID.test(venueId) || !BASE) return;
  queue.push({ kind, venueId, ...extra, at: new Date().toISOString() });
  if (queue.length >= 20) void flush();
  else {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), 4000);
  }
}

/** The same thing for every stop of a plan: shown, saved, shared. */
export function trackStops(kind: "shown" | "saved" | "shared", itinerary: Itinerary | null | undefined, occasion?: string) {
  for (const s of itinerary?.stops ?? []) track(kind, s.venue_id, { planKey: itinerary?.plan_key, occasion });
}

/** A key for a newly generated plan, kept on it through swaps and saving. */
export function newPlanKey(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const events = queue.splice(0, 60);
  try {
    const [{ data }, deviceId] = await Promise.all([supabase.auth.getSession(), getDeviceId()]);
    const token = data.session?.access_token;
    await fetch(`${BASE}/api/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ deviceId, events }),
    });
  } catch {
    // Dropped: nothing on screen depends on it.
  }
  if (queue.length) void flush();
}

// Whatever is queued goes before the app sleeps.
AppState.addEventListener("change", (s) => {
  if (s !== "active") void flush();
});
