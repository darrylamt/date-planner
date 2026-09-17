/**
 * Fetch opening hours for every venue already linked to Google.
 *
 *   npm run places:hours -- --dry     # show what would change, write nothing
 *   npm run places:hours              # write them
 *   npm run places:hours -- --limit 20
 *   npm run places:hours -- --all     # including venues that already have hours
 *
 * ── why this script has to exist ────────────────────────────────────────
 * Linking a venue to Google does not bring its hours. Linking stores a
 * place_id; the recurring sweep in places-sync then asks Google exactly one
 * question, "is this place still trading", because SWEEP_MASK is
 * "id,businessStatus" and widening it would bill every venue on every run at
 * a higher tier.
 *
 * Hours live in DETAIL_MASK, and until now the only thing that ever asked for
 * them was an admin opening a venue, pressing Find on Google and saving. So
 * the catalogue ended up with four venues unlinked and ninety-five without
 * hours, two numbers that sound like they should match and measure entirely
 * different things.
 *
 * This is the missing sweep. It is deliberately a script rather than part of
 * places:sync, because it is the expensive call: one run over the catalogue,
 * not a nightly habit.
 *
 * ── what it will not do ─────────────────────────────────────────────────
 * It never invents. A venue Google has no hours for is left null, which the
 * planner reads as unknown rather than as shut, and it never touches
 * business_status, phones or anything else the detail call happens to return.
 */
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const all = args.includes("--all");
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : undefined;

interface Row {
  id: string;
  name: string;
  google_place_id: string;
  opening_periods: unknown;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { placeDetails, placesConfigured } = await import("../src/lib/places");

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
    .select("id, name, google_place_id, opening_periods")
    .not("google_place_id", "is", null)
    .order("name");

  // Only the ones missing hours, unless asked for everything: re-fetching a
  // venue whose hours we already hold is a billed call for no new fact.
  if (!all) q = q.is("opening_periods", null);
  if (limit) q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error("Could not load venues:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];
  if (!rows.length) {
    console.log(
      all
        ? "No linked venues at all. Link them from the venue form first."
        : "Every linked venue already has hours on file."
    );
    return;
  }

  console.log(
    `${rows.length} linked venue(s) to check${dry ? " (dry run, nothing will be written)" : ""}.\n`
  );

  let got = 0;
  let none = 0;
  let failed = 0;

  for (const v of rows) {
    let detail;
    try {
      detail = await placeDetails(v.google_place_id);
    } catch (e) {
      console.log(`  ${v.name}: lookup failed, ${(e as Error).message}`);
      failed++;
      continue;
    }

    const periods = detail.openingPeriods;
    const text = detail.openingHours;

    /*
     * Google knows the place but publishes no hours for it. Left null on
     * purpose: null is "we do not know", which the planner treats as neither
     * open nor shut, and writing an empty array instead would quietly turn
     * that into "never open".
     */
    if (!periods || !periods.length) {
      console.log(`  ${v.name}: Google has no hours for this one`);
      none++;
      continue;
    }

    got++;
    const summary = text?.[0] ?? `${periods.length} period(s)`;
    console.log(`  ${v.name}: ${summary}`);

    if (!dry) {
      const { error: writeError } = await supabase
        .from("venues")
        .update({
          opening_periods: periods,
          opening_hours_text: text?.length ? text : null,
          hours_synced_at: new Date().toISOString(),
        })
        .eq("id", v.id);
      if (writeError) console.log(`     [write failed: ${writeError.message}]`);
    }
  }

  console.log(
    `\n${got} with hours, ${none} Google has none for, ${failed} failed.` +
      (dry ? "\nDry run: nothing was written." : "")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
