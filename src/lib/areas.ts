import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve an area name to its id, creating it if it does not exist.
 *
 * Adding a venue used to fail outright when its neighbourhood was not already
 * in the table, which made adding somewhere new a two-step job with a
 * confusing error in the middle. A venue's location IS an area — if we are
 * willing to list the venue, we are willing to list where it is.
 *
 * Matching is case-insensitive on a trimmed name, so "east legon" does not
 * become a second East Legon.
 */
export async function ensureAreaId(
  supabase: SupabaseClient,
  rawName: string,
  city = "Accra"
): Promise<{ id: string; created: boolean } | null> {
  const name = rawName.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from("areas")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (existing?.id) return { id: existing.id as string, created: false };

  const { data: inserted, error } = await supabase
    .from("areas")
    .insert({ name, city })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("could not create area", name, error);
    return null;
  }
  return { id: inserted.id as string, created: true };
}
