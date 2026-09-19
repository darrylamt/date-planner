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

  // ── 7. The columns 0038 and 0046 say are withheld ──────────────────────
  //
  // Read back through the service role every time, because PostgREST returns
  // a matched row whether or not anything changed: an update that wrote
  // nothing and an update that was refused look identical from the client.
  // The first version of this test compared area_id against the value it
  // already held, and passed a hole wide enough to move a venue through.
  const { data: otherArea } = await admin
    .from("areas")
    .select("id")
    .neq("id", area.id)
    .limit(1)
    .single();

  const withheld: [string, unknown][] = [
    ["area_id", otherArea.id],
    ["price_band", "premium"],
    ["is_free", true],
    ["aesthetics", 5],
    ["phone_status", "approved"],
    ["phone_pending", "+233 00 000 0000"],
  ];

  for (const [col, value] of withheld) {
    await as.from("venues").update({ [col]: value }).eq("id", venueId);
    const { data: back } = await admin.from("venues").select(col).eq("id", venueId).single();
    const wrote =
      JSON.stringify((back as Record<string, unknown> | null)?.[col]) === JSON.stringify(value);
    ok(`planner cannot write venues.${col}`, !wrote, wrote ? "WROTE IT" : "unchanged");
  }

  // A column they are meant to have, as a control: if this fails the
  // enforcement in 0047 has gone too far and the portal saves nothing.
  await as.from("venues").update({ description: "smoke test wrote this" }).eq("id", venueId);
  const { data: descBack } = await admin
    .from("venues")
    .select("description")
    .eq("id", venueId)
    .single();
  ok(
    "planner can still write venues.description",
    descBack?.description === "smoke test wrote this",
    descBack?.description ?? "null"
  );

  // ── 7b. The escalation that made the column list urgent ────────────────
  //
  // manages_menu_of() grants write access to venue v's menu to whoever runs a
  // venue whose menu_shared_from points at v. Right for a branch and its
  // owner. If a portal account can set menu_shared_from itself it picks the
  // target, and the chain ends in writing rows into somebody else's menu.
  const { data: menuRows } = await admin.from("menu_items").select("venue_id").limit(400);
  const tally = new Map<string, number>();
  for (const r of (menuRows ?? []) as { venue_id: string }[]) {
    tally.set(r.venue_id, (tally.get(r.venue_id) ?? 0) + 1);
  }
  const victim = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  if (victim) {
    await as.from("venues").update({ menu_shared_from: victim }).eq("id", venueId);
    const { data: shareBack } = await admin
      .from("venues")
      .select("menu_shared_from")
      .eq("id", venueId)
      .single();
    ok(
      "planner cannot point menu_shared_from at another venue",
      shareBack?.menu_shared_from !== victim,
      shareBack?.menu_shared_from === victim ? "POINTED AT IT" : "unchanged"
    );

    const { data: intruded } = await as
      .from("menu_items")
      .insert({ venue_id: victim, name: "zz-test intrusion", price_ghs: 1, category: "other" })
      .select("id");
    ok(
      "planner cannot write another venue's menu",
      (intruded ?? []).length === 0,
      (intruded ?? []).length ? "WROTE A ROW" : "refused"
    );
    for (const row of intruded ?? []) {
      await admin.from("menu_items").delete().eq("id", (row as { id: string }).id);
    }
  }

    // ── 7c. The other side of 0047: an admin must still get through ────────
  //
  // The enforcement in 0047 constrains portal accounts and waves admins past
  // on is_admin(). If that check ever breaks, the admin forms stop saving
  // price bands and aesthetics and say nothing about it -- PostgREST reports
  // an update that changed nothing as a success, which is how planner_note
  // and display_name each failed silently for the life of a feature.
  //
  // So the permission test has a counterpart: prove the gate still opens.
  const adminEmail = `zz-test-admin-${stamp}@example.com`;
  const { data: adminUser } = await admin.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  let adminOk = false;
  let adminDetail = "could not create the test admin";
  if (adminUser?.user) {
    await admin.from("profiles").update({ is_admin: true }).eq("id", adminUser.user.id);
    const asAdmin = createClient(url, anon, { auth: { persistSession: false } });
    const { error: signInErr } = await asAdmin.auth.signInWithPassword({
      email: adminEmail,
      password,
    });
    if (signInErr) {
      adminDetail = signInErr.message;
    } else {
      // price_band is withheld from a venue and is the admin's to set.
      await asAdmin.from("venues").update({ price_band: "premium" }).eq("id", venueId);
      const { data: band } = await admin
        .from("venues")
        .select("price_band")
        .eq("id", venueId)
        .single();
      adminOk = band?.price_band === "premium";
      adminDetail = band?.price_band ?? "null";
    }
    await admin.auth.admin.deleteUser(adminUser.user.id);
  }
  ok("an admin can still write a withheld column", adminOk, adminDetail);

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
    await admin.from("menu_items").delete().ilike("name", "zz-test%");
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
