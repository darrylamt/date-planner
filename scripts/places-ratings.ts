/**
 * Fetch Google's star rating for every venue linked to Google.
 *
 *   npm run places:ratings -- --dry        # show what would change, write nothing
 *   npm run places:ratings                 # active venues with no rating yet
 *   npm run places:ratings -- --all        # every active venue, refreshing old ratings
 *   npm run places:ratings -- --inactive   # switched-off venues too
 *   npm run places:ratings -- --limit 20
 *
 * ── why this script has to exist ────────────────────────────────────────
 * Durobot ranks "best rated" on place_rating, and nothing was writing it:
 * discovery fetched each rating and dropped it, and the venue form never
 * asked. Ten venues out of two hundred and ninety-one had one, so "the best
 * rated restaurants in Accra" came back as four branches of the Honeysuckle
 * and two of Flicks & Licks.
 *
 * One call per venue at Google's Enterprise tier (the rating fields live
 * there), so it is a script to run now and again, not part of the nightly
 * places:sync, whose mask is kept cheap on purpose.
 *
 * ── what it will not do ─────────────────────────────────────────────────
 * A venue Google has no rating for is left as it is: no rating is "new to
 * Google", not "rated badly". It writes the two rating columns and nothing
 * else, and leaves places_synced_at alone, because places:sync orders its
 * sweep by that stamp.
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
const dry = args.includes("--dry");
const all = args.includes("--all");
const inactive = args.includes("--inactive");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

type Row = { id: string; name: string; google_place_id: string; place_rating: number | null; place_rating_count: number | null };

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { placeRating, placesConfigured } = await import("../src/lib/places");

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

  let q = supabase
    .from("venues")
    .select("id, name, google_place_id, place_rating, place_rating_count")
    .not("google_place_id", "is", null)
    .order("name");
  if (!inactive) q = q.eq("is_active", true);
  // Only the ones without a rating, unless asked: a refresh is a billed call
  // for a number that moves slowly.
  if (!all) q = q.is("place_rating", null);
  if (limit) q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error("Could not load venues:", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as Row[];
  if (!rows.length) {
    console.log("Every venue in scope already has a rating. --all refreshes them.");
    return;
  }
  console.log(`${rows.length} venue(s) to look up${dry ? " (dry run, nothing will be written)" : ""}.\n`);

  let got = 0;
  let none = 0;
  let failed = 0;
  for (const v of rows) {
    let r;
    try {
      r = await placeRating(v.google_place_id);
    } catch (e) {
      console.log(`  ${v.name}: lookup failed, ${(e as Error).message}`);
      failed++;
      continue;
    }
    if (r.rating == null) {
      console.log(`  ${v.name}: no rating on Google yet`);
      none++;
      continue;
    }
    got++;
    const was = v.place_rating != null ? ` (was ${v.place_rating}, ${v.place_rating_count})` : "";
    console.log(`  ${v.name}: ${r.rating} from ${r.count ?? 0} reviews${was}`);
    if (!dry) {
      const { error: writeError } = await supabase
        .from("venues")
        .update({ place_rating: r.rating, place_rating_count: r.count })
        .eq("id", v.id);
      if (writeError) {
        console.log(`    could not save: ${writeError.message}`);
        failed++;
        got--;
      }
    }
  }

  console.log(`\n${got} rated${dry ? " (not written)" : ""}, ${none} with no rating on Google, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
