import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve an area name to its id, creating it if it does not exist.
 *
 * Adding a venue used to fail outright when its neighbourhood was not already
 * in the table, which made adding somewhere new a two-step job with a
 * confusing error in the middle. A venue's location IS an area, if we are
 * willing to list the venue, we are willing to list where it is.
 *
 * Matching is case-insensitive on a trimmed name, so "east legon" does not
 * become a second East Legon.
 */
/**
 * Names that are districts rather than neighbourhoods.
 *
 * Google's address components answer with the administrative unit, and
 * ensureAreaId creates whatever it is handed, which is how Kpeshie, Osu
 * Klottey, Ayawaso and La-Nkwantanang-Madina became areas holding a third of
 * the catalogue between them. Nobody in Accra says "meet me in Kpeshie": it is
 * a sub-metro containing Labone, Cantonments and Burma Camp, and a plan
 * offering it as a location is offering something nobody recognises.
 *
 * Blocked at creation rather than cleaned up afterwards, because 0035 cleaned
 * up afterwards and without this they would all be back by the next sync.
 *
 * Note what is not here: Weija and Madina are real places people name, even
 * though Weija-Gbawe and La-Nkwantanang-Madina are the districts around them.
 * The municipal name is blocked; the neighbourhood is not.
 */
const NOT_A_NEIGHBOURHOOD = new Set(
  [
    "kpeshie",
    "osu klottey",
    "ayawaso",
    "ayawaso west",
    "ayawaso east",
    "ayawaso north",
    "ayawaso central",
    "la dade-kotopon",
    "la dade kotopon",
    "la-nkwantanang-madina",
    "la nkwantanang madina",
    "ledzokuku",
    "krowor",
    "ashiedu keteke",
    "ablekuma",
    "ablekuma north",
    "ablekuma central",
    "ablekuma south",
    "ablekuma west",
    "okaikoi",
    "okaikoi north",
    "okaikoi south",
    "weija-gbawe",
    "weija gbawe",
    "ga east",
    "ga west",
    "ga south",
    "ga north",
    "ga central",
    "accra metropolitan",
    "accra metropolis",
    "tema metropolitan",
    "tema west",
    "greater accra",
    "greater accra region",
    "ghana",
    // A beach rather than a district, and 385 metres from Labone's centre.
    "laboma",
  ].map((x) => x.toLowerCase())
);

/** Whether a name is a district nobody would give as their location. */
export function isNeighbourhood(name: string): boolean {
  return !NOT_A_NEIGHBOURHOOD.has(name.trim().toLowerCase());
}

export async function ensureAreaId(
  supabase: SupabaseClient,
  rawName: string,
  city = "Accra"
): Promise<{ id: string; created: boolean } | null> {
  const name = rawName.trim();
  if (!name) return null;

  /*
   * An existing area of this name is still usable: the guard is about what
   * gets created, and refusing to resolve one already in the table would break
   * every venue currently filed under it.
   */
  const { data: known } = await supabase
    .from("areas")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (known?.id) return { id: known.id as string, created: false };

  if (!isNeighbourhood(name)) {
    console.warn(`refusing to create "${name}" as an area: it is a district, not a neighbourhood`);
    return null;
  }

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
