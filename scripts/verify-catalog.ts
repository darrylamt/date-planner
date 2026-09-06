/**
 * Bulk venue verification.
 *
 *   npm run verify:catalog              # every unverified venue
 *   npm run verify:catalog -- --all     # re-check everything
 *   npm run verify:catalog -- --limit 5 # try a handful first
 *
 * Runs locally rather than as a route: a thorough check takes 40-60s per
 * venue, so a full catalog would blow any serverless timeout. Uses the
 * service-role key, so it never runs in the browser.
 *
 * Costs real money — model tokens plus web searches per venue. It prints an
 * estimate and waits for confirmation before starting.
 */
import fs from "fs";
import path from "path";
import readline from "readline";

const root = process.cwd();

// Load .env.local before anything imports the Anthropic client, which reads
// the key at module load.
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
const reverifyAll = args.includes("--all");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;
const yes = args.includes("--yes");

async function confirm(question: string): Promise<boolean> {
  if (yes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => rl.question(question, res));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { verifyVenue } = await import("../src/lib/verify");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let query = supabase
    .from("venues")
    .select("*, areas(name)")
    .eq("is_active", true)
    .order("name");

  if (!reverifyAll) query = query.eq("verification_status", "unverified");
  if (limit) query = query.limit(limit);

  const { data: venues, error } = await query;
  if (error) {
    console.error("Could not load venues:", error.message);
    process.exit(1);
  }
  if (!venues?.length) {
    console.log(
      reverifyAll
        ? "No active venues in the catalog."
        : "Nothing to verify — every active venue has been checked. Use --all to re-check."
    );
    return;
  }

  console.log(`\n${venues.length} venue(s) to verify.`);
  console.log(`Roughly ${Math.ceil((venues.length * 50) / 60)} min and a few US$ in API spend.`);
  if (!(await confirm("Proceed? (y/N) "))) {
    console.log("Cancelled.");
    return;
  }

  const tally: Record<string, number> = {};
  let failures = 0;

  for (const [i, venue] of venues.entries()) {
    const areaName =
      (venue as { areas?: { name: string } | null }).areas?.name ?? "Accra";
    const label = `[${i + 1}/${venues.length}] ${venue.name} (${areaName})`;
    process.stdout.write(`${label} … `);

    const t0 = Date.now();
    const result = await verifyVenue(venue as never, areaName, {
      maxSearches: 6,
      effort: "high",
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(0);

    if (!result.ok) {
      console.log(`FAILED (${secs}s): ${result.error}`);
      failures++;
      continue;
    }

    const v = result.verification;
    tally[v.verdict] = (tally[v.verdict] ?? 0) + 1;

    const { error: writeError } = await supabase
      .from("venues")
      .update({
        verification_status: v.verdict,
        verification_confidence: v.confidence,
        verification_summary: v.summary,
        verification_sources: v.sources,
        verification_discrepancies: v.discrepancies,
        verified_at: new Date().toISOString(),
      })
      .eq("id", venue.id);

    console.log(
      `${v.verdict} (${v.confidence}) ${v.discrepancies.length} discrepancy(ies) ` +
        `${secs}s${writeError ? "  [WRITE FAILED: " + writeError.message + "]" : ""}`
    );
  }

  console.log("\n" + "=".repeat(50));
  for (const [verdict, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${verdict.padEnd(12)} ${n}`);
  }
  if (failures) console.log(`  ${"errored".padEnd(12)} ${failures}`);
  console.log("=".repeat(50));
  console.log("\nReview anything not 'real' at /admin/venues before it reaches users.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
