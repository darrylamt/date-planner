/**
 * Re-check every linked venue against Google, and deactivate the ones that
 * have closed.
 *
 *   npm run places:sync              # check all linked venues
 *   npm run places:sync -- --dry     # report, change nothing
 *   npm run places:sync -- --limit 20
 *
 * This exists because Brasa Accra was closed and stayed in the catalog as
 * active, appearing in generated plans, because nothing ever re-checked it.
 * Verification by model costs money per venue and had never once been run
 * across the catalog; this asks Google for two fields and is effectively free,
 * so it can run nightly and the question stops depending on someone noticing.
 *
 * A closure is a deactivation, not a deletion: the menu, prices and curation
 * took work, and a place that shut temporarily may reopen.
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
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { placeStatus, isClosed, placesConfigured } = await import("../src/lib/places");

  if (!placesConfigured()) {
    console.error(
      "GOOGLE_PLACES_API_KEY is not set. Add it to .env.local (and to Vercel for the deployed app)."
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  /** Every write stamps the sync time, so the resume order stays meaningful. */
  const touch = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("venues")
      .update({ ...patch, places_synced_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.log(`     [write failed: ${error.message}]`);
  };

  let query = supabase
    .from("venues")
    .select("id, name, is_active, google_place_id, business_status")
    .not("google_place_id", "is", null)
    // Least recently checked first, so an interrupted run resumes usefully.
    .order("places_synced_at", { ascending: true, nullsFirst: true });

  if (limit) query = query.limit(limit);

  const { data: venues, error } = await query;
  if (error) {
    console.error("Could not load venues:", error.message);
    process.exit(1);
  }
  if (!venues?.length) {
    console.log(
      "No venues are linked to Google yet. Link them from the venue form (Find on Google)."
    );
    return;
  }

  console.log(`Checking ${venues.length} linked venue(s)${dry ? " (dry run)" : ""}.\n`);

  let closed = 0;
  let reopened = 0;
  let gone = 0;
  let failed = 0;

  for (const v of venues as VenueRow[]) {
    let status: string | null;
    try {
      status = await placeStatus(v.google_place_id!);
    } catch (e) {
      console.log(`  ${v.name}: check failed — ${(e as Error).message}`);
      failed++;
      continue;
    }

    // Google no longer lists it at all. Worth a human look rather than an
    // automatic deactivation: it can mean a merged or replaced listing.
    if (status === null) {
      console.log(`  ${v.name}: NOT LISTED on Google any more — check by hand`);
      gone++;
      if (!dry) await touch(v.id, { business_status: "NOT_LISTED" });
      continue;
    }

    const shut = isClosed(status);

    if (shut && v.is_active) {
      console.log(`  ${v.name}: ${status} — deactivating`);
      closed++;
      if (!dry) {
        await touch(v.id, {
          business_status: status,
          is_active: false,
          verification_status: "closed",
          verification_summary: `Google reports ${status}.`,
          verified_at: new Date().toISOString(),
        });
      }
      continue;
    }

    /*
     * Reopened. Left inactive on purpose — it may have been switched off for a
     * reason of our own, and Google saying it trades again is not permission
     * to start recommending it.
     */
    if (!shut && !v.is_active && v.business_status && isClosed(v.business_status)) {
      console.log(`  ${v.name}: ${status} again — still inactive, reactivate by hand if you want it`);
      reopened++;
    }

    if (!dry) await touch(v.id, { business_status: status });
  }

  console.log("\n" + "=".repeat(52));
  console.log(`  checked      ${venues.length}`);
  console.log(`  deactivated  ${closed}`);
  console.log(`  reopened     ${reopened}`);
  console.log(`  not listed   ${gone}`);
  if (failed) console.log(`  failed       ${failed}`);
  console.log("=".repeat(52));
  if (dry) console.log("\nDry run — nothing was written.");
}

interface VenueRow {
  id: string;
  name: string;
  is_active: boolean;
  google_place_id: string | null;
  business_status: string | null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
