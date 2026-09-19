/**
 * Venues to put through a verification pass, with what we currently hold.
 *
 *   npm run verify:list            # 15 oldest-described venues
 *   npm run verify:list -- 30      # more of them
 *
 * Writes venues-to-verify.txt, already in the shape the prompt in
 * docs/verify-research-prompt.md expects to be fed: a name and the
 * description on file, so the model is checking a claim rather than being
 * asked to invent one.
 *
 * Oldest first. A description written five minutes ago by the same kind of
 * model is not the one worth a second opinion; the one nobody has looked at
 * since it was typed by hand is.
 *
 * Read-only.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

async function main() {
  const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 15);
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE,
    { auth: { persistSession: false } }
  );

  const { data } = await db
    .from("venues")
    .select("name, description, created_at, areas(name)")
    .eq("is_active", true)
    .not("description", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  type Row = { name: string; description: string | null; areas: { name?: string } | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => (r.description ?? "").trim());

  const out = rows
    .map((r) => `${r.name} — ${r.areas?.name ?? "area unknown"}\n  "${r.description}"`)
    .join("\n\n");

  const file = path.join(process.cwd(), "venues-to-verify.txt");
  fs.writeFileSync(file, out + "\n", "utf8");
  console.log(`${rows.length} venues, oldest first. Wrote ${file}`);
  console.log("Paste 10-15 at a time under the prompt in docs/verify-research-prompt.md.");
}

void main();
