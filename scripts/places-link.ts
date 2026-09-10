/**
 * Match existing venues to Google Places, so the closure sweep has something
 * to sweep.
 *
 *   npm run places:link              # propose matches, write nothing
 *   npm run places:link -- --apply   # link the confident ones
 *   npm run places:link -- --apply --all   # link every match, including weak ones
 *   npm run places:link -- --limit 10
 *
 * Linking by hand is one search per venue. This does the searching and shows
 * what it would link, but writes nothing without --apply, because a wrong link
 * is worse than no link: it points a venue at another business, and from then
 * on the sweep reports that business's opening hours as ours.
 *
 * Only close name matches are linked automatically. Anything doubtful is
 * listed for a person to decide, since "The Republic" and "Republic Bar &
 * Grill" being the same place is a judgement, not a string comparison.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();

const envPath = path.join(root, ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local found. Run from the project root.");
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const acceptAll = args.includes("--all");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

/** Lowercase, strip punctuation and the noise words venue names collect. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|restaurant|bar|grill|lounge|cafe|accra|ghana|ltd|limited)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How alike two names are, 0 to 1.
 *
 * Token overlap rather than edit distance: venue names differ by whole words
 * far more often than by characters ("Skybar" vs "Skybar25", "Vida e Caffe"
 * vs "Vida e Caffe - Labone"), and edit distance punishes a missing branch
 * suffix as heavily as a different business.
 */
function similarity(a: string, b: string): number {
  const A = new Set(normalise(a).split(" ").filter(Boolean));
  const B = new Set(normalise(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  A.forEach((t) => {
    if (B.has(t)) shared++;
  });
  return shared / Math.min(A.size, B.size);
}

const CONFIDENT = 0.8;

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { searchPlaces, placesConfigured, isClosed } = await import("../src/lib/places");

  if (!placesConfigured()) {
    console.error("GOOGLE_PLACES_API_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let query = supabase
    .from("venues")
    .select("id, name, is_active, areas(name)")
    .is("google_place_id", null)
    .eq("is_active", true)
    .order("name");

  if (limit) query = query.limit(limit);

  const { data: venues, error } = await query;
  if (error) {
    console.error("Could not load venues:", error.message);
    process.exit(1);
  }
  if (!venues?.length) {
    console.log("Every active venue is already linked.");
    return;
  }

  console.log(
    `${venues.length} unlinked venue(s).${apply ? "" : " Dry run, nothing will be written."}\n`
  );

  let linked = 0;
  let doubtful = 0;
  let missing = 0;
  let closedFound = 0;

  for (const v of venues as unknown as VenueRow[]) {
    const area = v.areas?.name ?? "";
    let results;
    try {
      results = await searchPlaces(`${v.name} ${area} Accra`.trim());
    } catch (e) {
      console.log(`  ${v.name}: search failed, ${(e as Error).message}`);
      continue;
    }

    if (!results.length) {
      console.log(`  ${v.name}: no match on Google`);
      missing++;
      continue;
    }

    // Best by name similarity, not by Google's own ranking: Google ranks by
    // prominence, which happily puts a famous unrelated place first.
    const ranked = results
      .map((r) => ({ r, score: similarity(v.name, r.name) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const shut = isClosed(best.r.businessStatus);
    const confident = best.score >= CONFIDENT;
    const flag = shut ? "  ← CLOSED ON GOOGLE" : "";

    if (shut) closedFound++;

    if (confident || acceptAll) {
      console.log(
        `  ${v.name}\n    → ${best.r.name} (${Math.round(best.score * 100)}%) ${best.r.address}${flag}`
      );
      linked++;
      if (apply) {
        const { error: writeError } = await supabase
          .from("venues")
          .update({
            google_place_id: best.r.id,
            business_status: best.r.businessStatus,
            places_synced_at: new Date().toISOString(),
          })
          .eq("id", v.id);
        if (writeError) console.log(`      [write failed: ${writeError.message}]`);
      }
    } else {
      console.log(
        `  ${v.name}: unsure, best was "${best.r.name}" (${Math.round(best.score * 100)}%)${flag}`
      );
      doubtful++;
    }
  }

  console.log("\n" + "=".repeat(52));
  console.log(`  ${apply ? "linked" : "would link"}   ${linked}`);
  console.log(`  too unsure     ${doubtful}`);
  console.log(`  not on Google  ${missing}`);
  if (closedFound) console.log(`  CLOSED         ${closedFound}  ← run places:sync after linking`);
  console.log("=".repeat(52));

  if (!apply && linked) {
    console.log("\nRe-run with --apply to write these links.");
  }
  if (doubtful) {
    console.log("Link the unsure ones by hand from the venue form, or use --all to accept them.");
  }
}

interface VenueRow {
  id: string;
  name: string;
  is_active: boolean;
  areas?: { name: string } | null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
