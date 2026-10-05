/**
 * What a planner's night is, shared by the list, the step-by-step editor and
 * the preview. No React and nothing server-only, so both halves can use it.
 */

import type { Audience } from "@/lib/types";

/*
 * Kinds of night, in a planner's words. The keys the admin has always stored
 * are kept so nothing already saved changes meaning; talks and art shows are
 * new, because culture nights are a large share of what planners run and had
 * nowhere to go but "something else".
 */
export const KINDS: { id: string; label: string; emoji: string }[] = [
  { id: "party", label: "Party or DJ night", emoji: "🎧" },
  { id: "live_music", label: "Live music", emoji: "🎷" },
  { id: "talk", label: "Talk or panel", emoji: "🎙️" },
  { id: "art_show", label: "Art show", emoji: "🖼️" },
  { id: "sip_and_paint", label: "Sip and paint", emoji: "🎨" },
  { id: "comedy", label: "Comedy", emoji: "😂" },
  { id: "karaoke", label: "Karaoke", emoji: "🎤" },
  { id: "brunch_party", label: "Brunch party", emoji: "🥂" },
  { id: "festival", label: "Festival", emoji: "🎪" },
  { id: "film_night", label: "Film night", emoji: "🎬" },
  { id: "workshop", label: "Workshop or class", emoji: "🛠️" },
  { id: "run_club", label: "Run club or sport", emoji: "🏃🏾" },
];

export const kindOf = (category: string | null | undefined) => KINDS.find((k) => k.id === category) ?? null;

/** A kind they typed, turned into the short key the listed ones use. */
export const customKindKey = (typed: string) =>
  typed.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "other";

/** "sip_and_paint" → "Sip and paint", for a kind nobody listed. */
export const kindLabel = (category: string | null | undefined) =>
  kindOf(category)?.label ?? (category ? category.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Event");

export const kindEmoji = (category: string | null | undefined) => kindOf(category)?.emoji ?? "✨";

/** How many vibes a night may claim: past three it stops saying anything. */
export const MAX_VIBES = 3;
export const vibeLabel = (v: string) => v.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase());

export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "women", label: "Ladies only" },
  { id: "men", label: "Men only" },
];

/** A night as the planner pages hold it. Mirrors the events row. */
export interface Night {
  id: string;
  title: string;
  description: string | null;
  venue_id: string | null;
  area_id: string | null;
  event_date: string;
  start_time: string | null;
  cost_ghs: number | null;
  category: string;
  vibe_tags: string[] | null;
  image_url: string | null;
  contact_phone: string | null;
  booking_url: string | null;
  audience: Audience | null;
  organiser_name: string | null;
  organiser_logo_url: string | null;
}

/** A place a night can be at: one of their own, or any venue on Duro. */
export interface Place {
  id: string;
  name: string;
  area_id: string;
  area: string;
  mine: boolean;
  image_url?: string | null;
}

/** Today in Accra, which is UTC all year. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-10" → { day: "Sat", date: 10, month: "Oct" }, read as a calendar date. */
export function dateParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return { day: DAY[at.getUTCDay()], date: d, month: MONTH[m - 1] };
}

export function friendlyDate(iso: string): string {
  const today = todayIso();
  if (iso === today) return "Tonight";
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (iso === tomorrow) return "Tomorrow";
  const p = dateParts(iso);
  return `${p.day} ${p.date} ${p.month}`;
}

/** "20:00:00" → "8pm", "19:30" → "7:30pm". */
export function friendlyTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

export function priceText(cost: number | null | undefined): string {
  if (cost == null) return "Price not set";
  return Number(cost) === 0 ? "Free entry" : `GHS ${Math.round(Number(cost))} entry`;
}
