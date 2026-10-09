/**
 * The venues worth researching, as a CSV to paste names from.
 *
 *   npm run research:list                 # missing description / tags / best_for / cuisines
 *   npm run research:list -- --instagram  # missing an Instagram handle
 *   npm run research:list -- --place      # missing a map link, a pin or a phone
 *   npm run research:list -- --menu       # switched on, but no menu prices to plan with
 *
 * Each list is also cut into batches of 25 under research/, the size a model
 * answers without padding the tail with filler.
 *
 * Writes venues-to-research.csv in the project root: every active venue
 * missing a description, vibe tags or best_for, with its area for context and
 * a column saying which of the three it is short of. Ordered by how much is
 * missing, so the first names pasted into a model are the ones where an
 * answer is worth most.
 *
 * Read-only. See docs/venue-research-prompt.md for what to do with it.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local found. Run from the project root.");
  process.exit(1);
}
const env: Record<string, string> = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

async function main() {
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE,
    { auth: { persistSession: false } }
  );

  if (process.argv.includes("--menu")) return listUnpriced(db);

  const { data, error } = await db
    .from("venues")
    .select("name, type, description, vibe_tags, best_for, cuisines, instagram_handle, google_maps_url, lat, lng, phone, phone_pending, areas(name)")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  type Row = {
    name: string;
    type: string;
    google_maps_url: string | null;
    lat: number | null;
    lng: number | null;
    phone: string | null;
    phone_pending: string | null;
    description: string | null;
    vibe_tags: string[] | null;
    best_for: string[] | null;
    cuisines: string[] | null;
    instagram_handle: string | null;
    areas: { name?: string } | null;
  };

  const bare = (v: unknown) =>
    !v || (Array.isArray(v) ? v.length === 0 : !String(v).trim());

  /*
   * Two worklists, because they are two different jobs.
   *
   * The default chases what a venue is like, which a model can usually
   * paraphrase from a listing. --instagram chases an account, which it either
   * finds or does not. Mixing them wastes a batch: a venue with a description
   * and no handle is finished for one job and untouched for the other.
   */
  const wantInstagram = process.argv.includes("--instagram");
  /*
   * A third job: where the venue is and how to reach it. One map listing
   * answers all three, the link, the pin and the number, so they are asked
   * together, and none of them is anything a description pass would find.
   */
  const wantPlace = process.argv.includes("--place");

  const rows = ((data ?? []) as unknown as Row[])
    .map((v) => {
      const missing = wantPlace
        ? ([
            bare(v.google_maps_url) ? "google_maps_url" : null,
            v.lat == null || v.lng == null ? "lat;lng" : null,
            bare(v.phone) && bare(v.phone_pending) ? "phone" : null,
          ].filter(Boolean) as string[])
        : wantInstagram
          ? bare(v.instagram_handle)
            ? ["instagram_handle"]
            : []
          : ([
              bare(v.description) ? "description" : null,
              bare(v.vibe_tags) ? "vibe_tags" : null,
              bare(v.best_for) ? "best_for" : null,
              // Only a kitchen has a cuisine.
              (v.type === "restaurant" || v.type === "cafe") && bare(v.cuisines) ? "cuisines" : null,
            ].filter(Boolean) as string[]);
      return { name: v.name, area: v.areas?.name ?? "", missing };
    })
    .filter((r) => r.missing.length)
    .sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));

  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["name,area,missing"]
    .concat(rows.map((r) => `${q(r.name)},${q(r.area)},${q(r.missing.join(" "))}`))
    .join("\n");

  const job = wantPlace ? "place" : wantInstagram ? "instagram" : "venues";
  const out = path.join(
    process.cwd(),
    wantPlace ? "venues-to-research-place.csv" : wantInstagram ? "venues-to-research-instagram.csv" : "venues-to-research.csv"
  );
  fs.writeFileSync(out, csv + "\n", "utf8");

  // The same list in batches of 25, replacing any earlier batches of this job.
  const dir = path.join(process.cwd(), "research");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${job}-`)) fs.unlinkSync(path.join(dir, f));
  const lines = csv.split("\n");
  for (let i = 1, b = 1; i < lines.length; i += 25, b++) {
    fs.writeFileSync(path.join(dir, `${job}-${String(b).padStart(2, "0")}.csv`), [lines[0], ...lines.slice(i, i + 25)].join("\n") + "\n", "utf8");
  }

  if (wantPlace) {
    console.log(`${rows.length} venues are missing a map link, a pin or a phone.`);
    console.log(`Wrote ${out}, and batches of 25 in research/place-*.csv`);
    console.log("Paste one batch at a time into docs/place-research-prompt.md.");
  } else if (wantInstagram) {
    console.log(`${rows.length} venues have no Instagram handle.`);
    console.log(`Wrote ${out}`);
    console.log("Paste 15-20 names at a time into docs/instagram-research-prompt.md.");
  } else {
    const most = rows.filter((r) => r.missing.length >= 3).length;
    console.log(`${rows.length} venues need something (${most} need three or more).`);
    console.log(`Wrote ${out}`);
    console.log("Paste 20-30 names at a time into docs/venue-research-prompt.md.");
  }
}

/**
 * Venues that are switched on but cannot be planned with, for want of a
 * price: about half the catalogue in October 2026. The same test Durobot and
 * the planner use (isPriced), so a venue on this list is exactly one they
 * skip. With its Instagram and map link, because that is where a menu is
 * usually found. Paste a batch into docs/menu-research-prompt.md.
 */
async function listUnpriced(db: ReturnType<typeof createClient>) {
  const { isPriced } = await import("../src/lib/chat/tools/shared");
  const { data, error } = await db
    .from("venues")
    .select("id, name, type, is_free, price_source, avg_cost_per_person_ghs, menu_shared_from, entry_fee_ghs, instagram_handle, google_maps_url, areas(name, city)")
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data: rows } = await db.from("menu_items").select("venue_id").gt("price_ghs", 0).range(from, from + 999);
    for (const r of (rows ?? []) as { venue_id: string }[]) counts.set(r.venue_id, (counts.get(r.venue_id) ?? 0) + 1);
    if (!rows || rows.length < 1000) break;
  }
  type V = { id: string; name: string; type: string; menu_shared_from: string | null; instagram_handle: string | null; google_maps_url: string | null; areas: { name?: string; city?: string } | null };
  const rows = ((data ?? []) as unknown as V[]).filter(
    (v) => !isPriced(v as never, counts.get(v.menu_shared_from ?? v.id) ?? 0)
  );
  const q = (x: string | null | undefined) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const lines = ["name,area,city,type,instagram,google_maps_url"].concat(
    rows.map((v) => [v.name, v.areas?.name, v.areas?.city, v.type, v.instagram_handle ? `@${v.instagram_handle.replace(/^@/, "")}` : "", v.google_maps_url].map(q).join(","))
  );
  const out = path.join(process.cwd(), "venues-to-research-menu.csv");
  fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
  const dir = path.join(process.cwd(), "research");
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith("menu-")) fs.unlinkSync(path.join(dir, f));
  for (let i = 1, b = 1; i < lines.length; i += 25, b++) {
    fs.writeFileSync(path.join(dir, `menu-${String(b).padStart(2, "0")}.csv`), [lines[0], ...lines.slice(i, i + 25)].join("\n") + "\n", "utf8");
  }
  console.log(`${rows.length} switched-on venues have no menu prices, so plans and Durobot skip them.`);
  console.log(`Wrote ${out}, and batches of 25 in research/menu-*.csv`);
  console.log("Paste one batch at a time into docs/menu-research-prompt.md.");
}

void main();
