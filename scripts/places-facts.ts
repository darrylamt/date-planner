/**
 * The facts Google holds for every linked venue, in one detail call each:
 * the Maps link, the phone number, the venue's own website and Google's
 * one-line summary.
 *
 *   npx tsx --env-file=.env.local scripts/places-facts.ts --dry   # report only
 *   npx tsx --env-file=.env.local scripts/places-facts.ts         # write
 *
 * What it writes, and only over blanks:
 *   google_maps_url   the place's own Maps link.
 *   phone_pending     the number, held behind 0004's gate. A person moves
 *                     it across with `npm run phones:approve`; nothing here
 *                     touches venues.phone itself.
 *
 * What it keeps beside the catalogue rather than in it: each venue's website
 * and Google's summary, in scripts/data/places-facts.json, for the photo and
 * menu research that starts from a venue's own pages (owner, 10 Nov 2026:
 * photos from the venue itself or free-licensed only).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { fetchAllRows } from "../src/lib/fetchAll";

const dry = process.argv.includes("--dry");
const MASK = "googleMapsUri,internationalPhoneNumber,nationalPhoneNumber,websiteUri,editorialSummary,businessStatus";

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const venues = await fetchAllRows<{ id: string; name: string; type: string; google_place_id: string | null; google_maps_url: string | null; phone: string | null; phone_pending: string | null }>(
    (a, b) =>
      db
        .from("venues")
        .select("id, name, type, google_place_id, google_maps_url, phone, phone_pending")
        .eq("is_active", true)
        .not("google_place_id", "is", null)
        .order("id")
        .range(a, b) as never
  );
  const out: Record<string, { name: string; type: string; website: string | null; summary: string | null; status: string | null }> = {};
  let maps = 0, phones = 0, sites = 0, failed = 0;
  for (const v of venues) {
    const r = await fetch(`https://places.googleapis.com/v1/places/${v.google_place_id}`, {
      headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": MASK },
    });
    if (!r.ok) {
      failed++;
      continue;
    }
    const p = (await r.json()) as {
      googleMapsUri?: string;
      internationalPhoneNumber?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      editorialSummary?: { text?: string };
      businessStatus?: string;
    };
    out[v.id] = { name: v.name, type: v.type, website: p.websiteUri ?? null, summary: p.editorialSummary?.text ?? null, status: p.businessStatus ?? null };
    if (p.websiteUri) sites++;
    const patch: Record<string, string> = {};
    if (!v.google_maps_url && p.googleMapsUri) patch.google_maps_url = p.googleMapsUri;
    const number = p.internationalPhoneNumber ?? p.nationalPhoneNumber;
    if (!v.phone && !v.phone_pending && number) patch.phone_pending = number;
    if (patch.google_maps_url) maps++;
    if (patch.phone_pending) phones++;
    if (!dry && Object.keys(patch).length) {
      const { error } = await db.from("venues").update(patch).eq("id", v.id);
      if (error) console.log(`  ${v.name}: ${error.message}`);
    }
  }
  mkdirSync("scripts/data", { recursive: true });
  writeFileSync("scripts/data/places-facts.json", JSON.stringify(out, null, 1));
  console.log(`${venues.length} linked venues read, ${failed} failed`);
  console.log(`${dry ? "would add" : "added"}: ${maps} Maps links, ${phones} phone numbers waiting for approval`);
  console.log(`${sites} have a website of their own (scripts/data/places-facts.json)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
