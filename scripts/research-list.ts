/**
 * The venues worth researching, as a CSV to paste names from.
 *
 *   npm run research:list                 # missing description / tags / best_for
 *   npm run research:list -- --instagram  # missing an Instagram handle
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

  const { data, error } = await db
    .from("venues")
    .select("name, description, vibe_tags, best_for, cuisines, instagram_handle, areas(name)")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  type Row = {
    name: string;
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

  const rows = ((data ?? []) as unknown as Row[])
    .map((v) => {
      const missing = wantInstagram
        ? bare(v.instagram_handle)
          ? ["instagram_handle"]
          : []
        : ([
            bare(v.description) ? "description" : null,
            bare(v.vibe_tags) ? "vibe_tags" : null,
            bare(v.best_for) ? "best_for" : null,
          ].filter(Boolean) as string[]);
      return { name: v.name, area: v.areas?.name ?? "", missing };
    })
    .filter((r) => r.missing.length)
    .sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));

  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["name,area,missing"]
    .concat(rows.map((r) => `${q(r.name)},${q(r.area)},${q(r.missing.join(" "))}`))
    .join("\n");

  const out = path.join(
    process.cwd(),
    wantInstagram ? "venues-to-research-instagram.csv" : "venues-to-research.csv"
  );
  fs.writeFileSync(out, csv + "\n", "utf8");

  if (wantInstagram) {
    console.log(`${rows.length} venues have no Instagram handle.`);
    console.log(`Wrote ${out}`);
    console.log("Paste 15-20 names at a time into docs/instagram-research-prompt.md.");
  } else {
    const all3 = rows.filter((r) => r.missing.length === 3).length;
    console.log(`${rows.length} venues need something (${all3} need all three).`);
    console.log(`Wrote ${out}`);
    console.log("Paste 20-30 names at a time into docs/venue-research-prompt.md.");
  }
}

void main();
