/**
 * Add the places a research batch found (docs/new-places-research-prompt.md).
 *
 *   npx tsx --env-file=.env.local scripts/import-research-places.ts research/new-places-01.csv           # show
 *   npx tsx --env-file=.env.local scripts/import-research-places.ts research/new-places-01.csv --write   # add
 *
 * Each row is found on Google Maps by its name and town, near the destination
 * it was given for, and added through venueFromPlace like every other place
 * (area, pin, hours, rating). A row Google cannot find, a closed place, one
 * outside Ghana, or one we already hold is reported and skipped: the research
 * says a place exists, Google's listing says where it is.
 *
 * Prices go in only as the row gives them, with their source and date in the
 * note: entry fees (Ghanaian, and visitor where it differs, 0106), and for a
 * stay its room and nightly rate. "low" confidence rows are listed, not added.
 * Phone numbers wait for approval like every found number (0004).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { findPlaces } from "../src/lib/places";
import { venueFromPlace } from "../src/lib/venueFromPlace";
import { compact } from "../src/lib/fold";
import { haversineKm } from "../src/lib/transport";
import type { VenueType } from "../src/lib/types";

const file = process.argv[2];
const write = process.argv.includes("--write");
const TYPES = new Set(["restaurant", "cafe", "lounge", "activity", "outdoor", "stay"]);

/** A CSV line, quotes respected. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const num = (s: string | undefined) => {
  const n = Number(String(s ?? "").replace(/[^0-9.]/g, ""));
  return s && s.trim() !== "" && Number.isFinite(n) ? n : null;
};

async function main() {
  if (!file) throw new Error("Give the CSV: scripts/import-research-places.ts research/new-places-01.csv");
  const text = readFileSync(file, "utf8").split(/\r?\n/);
  const end = text.findIndex((l) => l.trim() === "REPORT");
  const lines = (end >= 0 ? text.slice(0, end) : text).filter((l) => l.trim());
  const header = cells(lines[0]);
  const rows = lines.slice(1).map((l) => Object.fromEntries(cells(l).map((c, i) => [header[i], c])) as Record<string, string>);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: dests } = await db.from("destinations").select("slug, name, town, lat, lng");
  const destFor = (name: string) =>
    ((dests ?? []) as { slug: string; name: string; town: string | null; lat: number; lng: number }[]).find((d) =>
      [d.slug, d.name, d.town].some((x) => x && compact(x) && (compact(x).includes(compact(name)) || compact(name).includes(compact(x))))
    );
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  for (const r of rows) {
    const label = `${r.name} (${r.town}, ${r.type})`;
    if (!r.name || !TYPES.has(r.type)) {
      console.log(`  ${label}: no name or an unknown type, skipped`);
      continue;
    }
    if (r.confidence === "low") {
      console.log(`  ${label}: low confidence, listed only`);
      continue;
    }
    const dest = destFor(r.destination || r.town);
    const near = dest ? { lat: Number(dest.lat), lng: Number(dest.lng) } : undefined;
    const hits = await findPlaces(`${r.name}, ${r.town}, Ghana`, near, 30_000);
    const want = compact(r.name);
    const hit = hits.find((h) => {
      const got = compact(h.name);
      const named = got.includes(want.slice(0, 8)) || want.includes(got.slice(0, 8));
      const close = !near || h.lat == null || haversineKm(near, { lat: h.lat, lng: h.lng! }) <= 40;
      return named && close && !/Togo|Burkina|Ivoire/i.test(h.address ?? "");
    });
    if (!hit) {
      console.log(`  ${label}: not found on Google Maps near ${dest?.name ?? r.town}, skipped`);
      continue;
    }
    const { data: held } = await db.from("venues").select("id").eq("google_place_id", hit.id).maybeSingle();
    if (held) {
      console.log(`  ${label}: already held, skipped`);
      continue;
    }
    const fee = num(r.entry_fee_ghs), visitor = num(r.entry_fee_visitor_ghs), night = num(r.price_per_night_ghs);
    const priced = fee != null || night != null;
    console.log(`  ${label} -> ${hit.name}${fee != null ? `, entry GH¢${fee}${visitor != null ? ` / visitors GH¢${visitor}` : ""}` : ""}${night != null ? `, ${r.room_name || "room"} GH¢${night}/night` : ""}${priced ? "" : ", no price"}`);
    if (!write) continue;
    const res = await venueFromPlace(db, hit.id, { type: r.type as VenueType });
    if (!res.ok) {
      console.log(`    not added: ${res.error}`);
      continue;
    }
    const id = res.venue.id;
    const source = r.price_source_url ? ` (${r.price_source_url}${r.price_seen ? `, ${r.price_seen}` : ""}; read ${today})` : "";
    const patch: Record<string, unknown> = {};
    const { data: v } = await db.from("venues").select("phone, description").eq("id", id).single();
    const row = v as { phone: string | null; description: string | null } | null;
    if (row?.phone) Object.assign(patch, { phone: null, phone_pending: row.phone });
    if (!row?.description && r.what_it_is) patch.description = r.what_it_is.slice(0, 300);
    if (r.type !== "stay" && fee != null) {
      Object.assign(patch, {
        entry_fee_ghs: fee,
        entry_fee_visitor_ghs: visitor,
        avg_cost_per_person_ghs: 0,
        price_source: "menu",
        charges_note: `${visitor != null ? `Ghanaians GH¢${fee}, visitors GH¢${visitor}` : `Entry GH¢${fee}`}${r.price_note ? `. ${r.price_note}` : ""}${source}`.slice(0, 500),
      });
    }
    if (Object.keys(patch).length) await db.from("venues").update(patch).eq("id", id);
    if (r.type === "stay") {
      await db.from("stay_details").upsert({ venue_id: id, kind: "hotel", region: "Greater Accra", town: r.town, rates_checked_on: night != null ? today : null, notes: r.price_note ? `${r.price_note}${source}` : null }, { onConflict: "venue_id" });
      if (night != null) {
        await db.from("stay_rooms").insert({ venue_id: id, name: (r.room_name || "Standard room").slice(0, 80), room_type: "double", sleeps: 2, price_per_night_ghs: night, notes: `As published${source}`.slice(0, 500) });
      }
    }
    added++;
  }
  console.log(write ? `added ${added}` : "Shown only. Add --write to add them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
