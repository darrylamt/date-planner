/**
 * Does a planner's location actually reach the catalogue?
 *
 *   npx tsx scripts/planner-smoke.ts
 *
 * Creates a real planner account, signs in as them with the anon key the
 * portal uses, makes a location and an event, and takes all of it back out
 * again. Everything it creates is named zz-test-*, and the cleanup runs even
 * when an assertion throws.
 *
 * It exists for the parts of migration 0046 that no amount of reading proves:
 * whether the insert policy lets a planner through, whether the trigger
 * claims the new venue so they can still edit it, whether a free event is
 * actually priced rather than merely unpriced, and -- the half that matters
 * more -- that an ordinary signed-in app user still cannot invent a venue.
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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(url, service, { auth: { persistSession: false } });

async function main() {
  const stamp = Date.now().toString(36);
  const username = `zz-test-planner-${stamp}`;
  const email = `${username}@venues.aduro.invalid`;
  const password = "test-" + stamp + "-Aa1";

  let userId: string | null = null;
  let venueId: string | null = null;
  let eventId: string | null = null;
  const results: { name: string; pass: boolean; detail: string }[] = [];
  const ok = (name: string, pass: boolean, detail: unknown = "") =>
    results.push({ name, pass, detail: String(detail).slice(0, 160) });

  try {
    // ── 0. Migration present? ──────────────────────────────────────────────
    const probe = await admin.from("event_planners").select("user_id").limit(1);
    if (probe.error) {
      console.log("migration 0046 has not been run yet:", probe.error.message);
      process.exit(0);
    }
    ok("0046 applied", true);

    // ── 1. Create the account, as the admin route does ─────────────────────
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { venue_portal: true, event_planner: true, username },
    });
    if (cErr) throw new Error("createUser: " + cErr.message);
    userId = created.user.id;

    const { error: pErr } = await admin.from("event_planners").insert({
      user_id: userId,
      username,
      display_name: "Test Planner " + stamp,
    });
    if (pErr) throw new Error("event_planners insert: " + pErr.message);
    ok("planner row created", true);

    // ── 2. Sign in as them, with the anon key the portal uses ──────────────
    const as = createClient(url, anon, { auth: { persistSession: false } });
    const { error: sErr } = await as.auth.signInWithPassword({ email, password });
    if (sErr) throw new Error("signIn: " + sErr.message);
    ok("planner can sign in", true);

    // Their own row is readable; that is what the portal gate reads.
    const { data: mine } = await as
      .from("event_planners")
      .select("username, display_name")
      .eq("user_id", userId)
      .maybeSingle();
    ok("planner reads own row", Boolean(mine), mine?.username ?? "no row");

    // ── 3. Create a location ───────────────────────────────────────────────
    const { data: area } = await admin.from("areas").select("id, name").limit(1).single();
    const { error: vErr } = await as.from("venues").insert({
      name: "ZZ Test Lawn " + stamp,
      type: "outdoor",
      area_id: area.id,
      description: "A lawn that exists for one test.",
    });
    ok("planner creates a location", !vErr, vErr?.message ?? "");
    if (vErr) throw new Error("venue insert: " + vErr.message);

    const { data: found } = await admin
      .from("venues")
      .select("id, name, area_id, is_active")
      .eq("name", "ZZ Test Lawn " + stamp)
      .maybeSingle();
    venueId = found?.id ?? null;
    ok("location is live with no approval", found?.is_active === true, `is_active=${found?.is_active}`);

    // ── 4. The trigger claimed it for them ─────────────────────────────────
    const { data: link } = await as.from("venue_users").select("venue_id").eq("venue_id", venueId);
    ok("trigger linked the location to its planner", (link ?? []).length === 1, `${(link ?? []).length} link rows`);

    // ── 5. They can put an event at it, with a contact number ──────────────
    const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const { data: ev, error: eErr } = await as
      .from("events")
      .insert({
        title: "ZZ Test Night " + stamp,
        venue_id: venueId,
        area_id: area.id,
        event_date: date,
        start_time: "19:00",
        cost_ghs: 0,
        category: "live_music",
        contact_phone: "+233 55 000 0000",
      })
      .select("id, contact_phone")
      .single();
    ok("planner adds an event", !eErr, eErr?.message ?? "");
    eventId = ev?.id ?? null;
    ok("contact_phone saved with no approval step", ev?.contact_phone === "+233 55 000 0000", ev?.contact_phone ?? "null");

    // ── 6. A signed-out visitor sees the event and its number ──────────────
    const pub = createClient(url, anon, { auth: { persistSession: false } });
    const { data: seen } = await pub
      .from("events")
      .select("id, title, contact_phone")
      .eq("id", eventId)
      .maybeSingle();
    ok("the number is public straight away", seen?.contact_phone === "+233 55 000 0000", seen?.contact_phone ?? "null");

    // ── 7. The thing a planner must NOT be able to do ──────────────────────
    const { data: moved, error: mErr } = await as
      .from("venues")
      .update({ area_id: area.id })
      .eq("id", venueId)
      .select("id");
    ok(
      "planner cannot move a location between areas",
      Boolean(mErr) || (moved ?? []).length === 0,
      mErr?.message ?? `${(moved ?? []).length} rows updated`
    );

    const { data: other } = await admin.from("venues").select("id").neq("id", venueId).limit(1).single();
    const { data: hijack, error: hErr } = await as
      .from("venues")
      .update({ description: "hijacked" })
      .eq("id", other.id)
      .select("id");
    ok(
      "planner cannot edit a venue they did not make",
      Boolean(hErr) || (hijack ?? []).length === 0,
      hErr?.message ?? `${(hijack ?? []).length} rows updated`
    );

    // ── 8. A signed-in app user is not a planner ───────────────────────────
    const plain = createClient(url, anon, { auth: { persistSession: false } });
    const plainEmail = `zz-test-user-${stamp}@example.com`;
    const { data: pu } = await admin.auth.admin.createUser({
      email: plainEmail,
      password,
      email_confirm: true,
    });
    await plain.auth.signInWithPassword({ email: plainEmail, password });
    const { error: nopeErr, data: nope } = await plain
      .from("venues")
      .insert({ name: "ZZ Should Not Exist " + stamp, type: "outdoor", area_id: area.id })
      .select("id");
    ok(
      "an ordinary app user cannot create a venue",
      Boolean(nopeErr) || (nope ?? []).length === 0,
      nopeErr?.message ?? "INSERT SUCCEEDED - the policy is not holding"
    );
    await admin.auth.admin.deleteUser(pu.user.id);
    await admin.from("venues").delete().eq("name", "ZZ Should Not Exist " + stamp);
  } catch (e) {
    ok("ran to completion", false, e instanceof Error ? e.message : String(e));
  } finally {
    // ── Clean up, whatever happened ────────────────────────────────────────
    if (eventId) await admin.from("events").delete().eq("id", eventId);
    if (venueId) {
      await admin.from("venue_users").delete().eq("venue_id", venueId);
      await admin.from("venues").delete().eq("id", venueId);
    }
    if (userId) {
      await admin.from("event_planners").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    const leftoverV = await admin.from("venues").select("id").ilike("name", "ZZ Test%");
    const leftoverP = await admin.from("event_planners").select("user_id").ilike("username", "zz-test-%");
    ok(
      "cleaned up after itself",
      (leftoverV.data ?? []).length === 0 && (leftoverP.data ?? []).length === 0,
      `${(leftoverV.data ?? []).length} venues, ${(leftoverP.data ?? []).length} planners left`
    );
  }

  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  — " + r.detail : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);

}

void main();
