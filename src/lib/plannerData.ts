import { createClient } from "@/lib/supabase/server";
import type { PlannerSession } from "@/lib/plannerAuth";
import type { ListedNight } from "@/components/planner/NightsList";
import type { Night, Place } from "@/components/planner/nights";

/**
 * What the planner pages read, on the planner's own session so the policies
 * decide what comes back.
 */

/** Every night they made, and any at a place of their own. */
export async function loadNights(session: PlannerSession): Promise<ListedNight[]> {
  const supabase = createClient();
  const mine = session.ownPlaces.map((p) => p.id);
  const filter = mine.length ? `created_by.eq.${session.userId},venue_id.in.(${mine.join(",")})` : `created_by.eq.${session.userId}`;
  const { data } = await supabase.from("events").select("*").eq("is_active", true).or(filter).order("event_date").limit(400);
  const nights = (data ?? []) as Night[];

  const ids = [...new Set(nights.map((n) => n.venue_id).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, { name: string; area: string }>();
  if (ids.length) {
    const { data: venues } = await supabase.from("venues").select("id, name, areas(name)").in("id", ids);
    for (const v of (venues ?? []) as unknown as { id: string; name: string; areas: { name: string } | null }[]) {
      names.set(v.id, { name: v.name, area: v.areas?.name ?? "" });
    }
  }
  return nights.map((n) => ({
    ...n,
    placeName: (n.venue_id && names.get(n.venue_id)?.name) || "",
    area: (n.venue_id && names.get(n.venue_id)?.area) || "",
  }));
}

/** Every active venue a night can be at, their own first. */
export async function loadPlaces(session: PlannerSession): Promise<Place[]> {
  const supabase = createClient();
  const own = new Set(session.ownPlaces.map((p) => p.id));
  const { data } = await supabase.from("venues").select("id, name, area_id, areas(name)").eq("is_active", true).order("name").limit(2000);
  return ((data ?? []) as unknown as { id: string; name: string; area_id: string; areas: { name: string } | null }[])
    .map((v) => ({ id: v.id, name: v.name, area_id: v.area_id, area: v.areas?.name ?? "", mine: own.has(v.id) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
}

export async function loadAreas(): Promise<{ id: string; name: string }[]> {
  const { data } = await createClient().from("areas").select("id, name").order("name");
  return (data ?? []) as { id: string; name: string }[];
}

/** The venue they use most over their latest nights; ties go to the most recent. */
export function usualPlaceOf(nights: Night[]): string | null {
  const recent = [...nights].sort((x, y) => y.event_date.localeCompare(x.event_date)).slice(0, 12);
  const uses = new Map<string, number>();
  for (const e of recent) if (e.venue_id) uses.set(e.venue_id, (uses.get(e.venue_id) ?? 0) + 1);
  return [...uses.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}
