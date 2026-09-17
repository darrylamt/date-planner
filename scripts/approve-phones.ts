/**
 * Approve every pending phone number at once.
 *
 *   npm run phones:approve -- --dry   # list them, change nothing
 *   npm run phones:approve            # approve them
 *
 * ── what this is doing, said plainly ────────────────────────────────────
 * venues.phone is the number the reservation flow dials under our own name.
 * Migration 0004 put a gate in front of it: an imported or scraped number
 * lands in phone_pending and only a person may move it across. 0013 and 0014
 * then revoked the column from every client so a pending number cannot even be
 * read, and 0028 undid twenty approvals the venue form had quietly reversed.
 *
 * That gate exists because a venue anyone could silently repoint is a venue
 * anyone could silently repoint at themselves. Running this is a person
 * deciding, in one go, that every number currently waiting is good. It is not
 * a shortcut around the gate; it is the gate being opened deliberately.
 *
 * The dry run prints every number first, and is worth reading.
 */
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local found. Run from the project root.");
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const dry = process.argv.includes("--dry");

interface Pending {
  id: string;
  name: string;
  phone: string | null;
  phone_pending: string | null;
  phone_source: string | null;
}

const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await admin
    .from("venues")
    .select("id, name, phone, phone_pending, phone_source")
    .eq("phone_status", "pending")
    .not("phone_pending", "is", null)
    .order("name");

  if (error) {
    console.error("Could not load pending numbers:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Pending[];
  if (!rows.length) {
    console.log("Nothing is waiting for approval.");
  } else {
    console.log(`${rows.length} number(s) waiting${dry ? " (dry run)" : ""}:\n`);
    for (const v of rows) {
      // A pending number identical to the one already live is 0028's case
      // over again: an edit re-proposed what was approved. Worth seeing.
      const same = v.phone && digits(v.phone) === digits(v.phone_pending);
      console.log(
        `  ${v.name}\n     ${v.phone_pending}${same ? "  (same as the number already live)" : ""}` +
          `\n     source: ${v.phone_source ?? "unrecorded"}`
      );
    }

    if (!dry) {
      const now = new Date().toISOString();
      let done = 0;
      for (const v of rows) {
        const { error: writeError } = await admin
          .from("venues")
          .update({
            phone: v.phone_pending,
            phone_pending: null,
            phone_status: "approved",
            phone_approved_at: now,
            phone_source: v.phone_source ?? "bulk approval",
          })
          .eq("id", v.id);
        if (writeError) console.log(`  [${v.name}: ${writeError.message}]`);
        else done++;
      }
      console.log(`\n${done} number(s) are now dialable.`);
    }
  }

  /*
   * The alternates table has its own gate, and RLS there shows only approved
   * rows, so a pending alternate is invisible to the app rather than merely
   * unused. Approved in the same breath, or half the job is done.
   */
  const { data: alts } = await admin
    .from("venue_phones")
    .select("id, number, label")
    .eq("status", "pending");

  const altRows = (alts ?? []) as { id: string; number: string; label: string | null }[];
  if (altRows.length) {
    console.log(`\n${altRows.length} alternate number(s) waiting:`);
    altRows.forEach((a) => console.log(`  ${a.number}  ${a.label ?? ""}`));
    if (!dry) {
      const { error: altError } = await admin
        .from("venue_phones")
        .update({ status: "approved" })
        .eq("status", "pending");
      console.log(altError ? `  [${altError.message}]` : `  approved.`);
    }
  }

  if (dry) console.log("\nDry run: nothing was changed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
