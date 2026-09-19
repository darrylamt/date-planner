/**
 * The venues worth researching, as a CSV to paste names from.
 *
 *   npm run research:list
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

  const rows = ((data ?? []) as unknown as Row[])
    .map((v) => {
      const missing = [
        bare(v.description) ? "description" : null,
        bare(v.vibe_tags) ? "vibe_tags" : null,
        bare(v.best_for) ? "best_for" : null,
      ].filter(Boolean) as string[];
      return { name: v.name, area: v.areas?.name ?? "", missing };
    })
    // A venue with all three is where a research pass pays for itself.
    .filter((r) => r.missing.length)
    .sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));

  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["name,area,missing"]
    .concat(rows.map((r) => `${q(r.name)},${q(r.area)},${q(r.missing.join(" "))}`))
    .join("\n");

  const out = path.join(process.cwd(), "venues-to-research.csv");
  fs.writeFileSync(out, csv + "\n", "utf8");

  const all3 = rows.filter((r) => r.missing.length === 3).length;
  console.log(`${rows.length} venues need something (${all3} need all three).`);
  console.log(`Wrote ${out}`);
  console.log("Paste 20-30 names at a time into the prompt in docs/venue-research-prompt.md.");
}

void main();
