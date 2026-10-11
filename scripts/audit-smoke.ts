/**
 * Do migration 0080's triggers hold against the live database?
 *
 *   npx tsx scripts/audit-smoke.ts
 *
 * Writes through the anon key and through throwaway signed-in accounts, the
 * way a stranger calling PostgREST directly would, and checks what actually
 * landed. Everything it creates is named zz-test-* and is removed in finally,
 * even when an assertion throws. Run it after pasting 0080 in.
 */
import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const stamp = Date.now().toString(36);
const results: { name: string; pass: boolean; detail: string }[] = [];
const ok = (name: string, pass: boolean, detail: unknown = "") =>
  results.push({ name, pass, detail: String(detail).slice(0, 160) });
const SOMEONE = "00000000-0000-4000-8000-000000000001";

const users: string[] = [];
const venues: string[] = [];

async function signedIn(label: string): Promise<{ id: string; db: SupabaseClient }> {
  const email = `zz-test-${label}-${stamp}@venues.aduro.invalid`;
  const password = `test-${stamp}-Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  users.push(data.user.id);
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: sErr } = await db.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn ${label}: ${sErr.message}`);
  return { id: data.user.id, db };
}

let areaId = "";
async function testVenue(label: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data: area } = await admin.from("areas").select("id").limit(1).single();
  areaId = area!.id;
  const { data, error } = await admin
    .from("venues")
    .insert({ name: `ZZ Test ${label} ${stamp}`, type: "restaurant", area_id: area!.id, is_active: false, ...extra })
    .select("id")
    .single();
  if (error || !data) throw new Error(`venue ${label}: ${error?.message}`);
  venues.push(data.id);
  return data.id;
}

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function main() {
  const venueA = await testVenue("A");
  const venueB = await testVenue("B");

  // ── 1. Booking requests: a stranger files as nobody, as a new request ────
  const { error: rErr } = await anon.from("reservation_requests").insert({
    venue_id: venueA,
    venue_name: "zz-test",
    user_id: SOMEONE,
    reservation_date: inDays(3),
    arrival_time: "19:00",
    status: "confirmed",
    created_at: "2099-01-01T00:00:00Z",
    guest_name: "zz-test",
  });
  ok("anon can still lodge a request", !rErr, rErr?.message);
  const { data: rRow } = await admin
    .from("reservation_requests")
    .select("id, user_id, status, created_at")
    .eq("venue_id", venueA)
    .maybeSingle();
  ok("request forced to status requested", rRow?.status === "requested", rRow?.status);
  ok("request not filed as somebody else", rRow?.user_id === null, rRow?.user_id);
  ok("request timestamped now", rRow && new Date(rRow.created_at).getFullYear() < 2099, rRow?.created_at);

  const { error: farErr } = await anon.from("reservation_requests").insert({
    venue_id: venueA, venue_name: "zz-test", reservation_date: "2099-12-31", arrival_time: "19:00",
  });
  ok("far-future request refused", Boolean(farErr), farErr?.message ?? "inserted");

  // ── 2. A venue login changes status only, and cannot see the guest's id ──
  const venueUser = await signedIn("venue");
  await admin.from("venue_users").insert({ user_id: venueUser.id, venue_id: venueA, username: `zz-test-v-${stamp}` });
  if (rRow) {
    await venueUser.db
      .from("reservation_requests")
      .update({ status: "confirmed", guest_name: "rewritten", party_size: 20 })
      .eq("id", rRow.id);
    const { data: after } = await admin
      .from("reservation_requests")
      .select("status, guest_name, party_size")
      .eq("id", rRow.id)
      .single();
    ok("venue can confirm", after?.status === "confirmed", after?.status);
    ok("venue cannot rewrite the booking", after?.guest_name === "zz-test" && after?.party_size !== 20, JSON.stringify(after));
  }
  const { error: idErr } = await venueUser.db.from("reservation_requests").select("user_id").eq("venue_id", venueA);
  ok("venue cannot read the guest's account id", Boolean(idErr), idErr?.message ?? "user_id readable");
  const { data: listed, error: listErr } = await venueUser.db
    .from("reservation_requests")
    .select("id, guest_name, status")
    .eq("venue_id", venueA);
  ok("venue still reads its bookings", !listErr && (listed ?? []).length === 1, listErr?.message ?? `${(listed ?? []).length} rows`);

  // ── 3. Reports: open, unattributed unless signed in ──────────────────────
  const { error: vrErr } = await anon.from("venue_reports").insert({
    venue_id: venueA, report_type: "other", note: "zz-test", status: "dismissed",
    reporter_id: SOMEONE, reviewed_by: SOMEONE,
  });
  ok("anon can still report a venue", !vrErr, vrErr?.message);
  const { data: vr } = await admin.from("venue_reports").select("status, reporter_id, reviewed_by").eq("venue_id", venueA).maybeSingle();
  ok("report forced open and unattributed", vr?.status === "open" && vr.reporter_id === null && vr.reviewed_by === null, JSON.stringify(vr));

  const { error: irErr } = await anon.from("issue_reports").insert({
    area: "other", message: "zz-test issue " + stamp, reporter_id: SOMEONE,
    context: { screen: "zz", lastError: { x: 1 } },
  });
  ok("anon can still report a problem", !irErr, irErr?.message);
  const { data: ir } = await admin
    .from("issue_reports")
    .select("id, reporter_id, context")
    .eq("message", "zz-test issue " + stamp)
    .maybeSingle();
  const ctx = (ir?.context ?? {}) as Record<string, unknown>;
  ok("problem report not pinned on somebody", ir?.reporter_id === null, ir?.reporter_id);
  ok("non-text context dropped", ctx.screen === "zz" && !("lastError" in ctx), JSON.stringify(ctx));
  if (ir) await admin.from("issue_reports").delete().eq("id", ir.id);

  // ── 4. Pickups have no writer ────────────────────────────────────────────
  const { error: pkErr } = await venueUser.db.from("plan_pickups").insert({ plan_id: SOMEONE, variant_id: SOMEONE, quantity: 1, price_ghs: 0 });
  ok("app user cannot insert pickups", Boolean(pkErr), pkErr?.message ?? "inserted");

  // ── 5. Links must be web links ───────────────────────────────────────────
  const { error: jsErr } = await admin.from("venues").update({ google_maps_url: "javascript:alert(1)" }).eq("id", venueA);
  ok("javascript: maps link refused", Boolean(jsErr), jsErr?.message ?? "saved");

  // ── 6. Suspended planners lose their venues; Hosted by is theirs ─────────
  const planner = await signedIn("planner");
  await admin.from("event_planners").insert({ user_id: planner.id, username: `zz-test-p-${stamp}`, display_name: "ZZ Real Name" });
  await admin.from("venue_users").insert({ user_id: planner.id, venue_id: venueB, username: `zz-test-pv-${stamp}` });
  const { data: ev, error: evErr } = await planner.db
    .from("events")
    .insert({ title: "zz-test night " + stamp, venue_id: venueB, area_id: areaId, event_date: inDays(5), organiser_name: "Somebody Famous", category: "live_music" })
    .select("id, organiser_name, created_by")
    .single();
  ok("planner can still add an event", !evErr, evErr?.message);
  ok("Hosted by comes from the planner row", ev?.organiser_name === "ZZ Real Name", ev?.organiser_name);
  ok("event created_by is the planner", ev?.created_by === planner.id, ev?.created_by);

  await admin.from("event_planners").update({ is_active: false }).eq("user_id", planner.id);
  const { data: edited } = await planner.db.from("venues").update({ description: "zz suspended edit" }).eq("id", venueB).select("id");
  ok("suspended planner cannot edit their venue", (edited ?? []).length === 0, `${(edited ?? []).length} rows`);
  if (ev) await admin.from("events").delete().eq("id", ev.id);

  // ── 7. Recommendations are judged at the dish's own venue ────────────────
  const { data: item } = await admin
    .from("menu_items")
    .insert({ venue_id: venueA, name: "zz-test dish " + stamp, price_ghs: 10 })
    .select("id")
    .single();
  if (item) {
    const { error: recErr } = await venueUser.db
      .from("menu_item_recommendations")
      .insert({ user_id: venueUser.id, menu_item_id: item.id, venue_id: venueB });
    ok("app user can still recommend", !recErr, recErr?.message);
    const { data: rec } = await admin.from("menu_item_recommendations").select("venue_id").eq("menu_item_id", item.id).maybeSingle();
    ok("recommendation bound to the dish's venue", rec?.venue_id === venueA, rec?.venue_id);
    await admin.from("menu_item_recommendations").delete().eq("menu_item_id", item.id);
    await admin.from("menu_items").delete().eq("id", item.id);
  } else ok("test dish created", false);
}

main()
  .catch((e) => ok("ran to completion", false, e instanceof Error ? e.message : String(e)))
  .finally(async () => {
    await admin.from("reservation_requests").delete().in("venue_id", venues);
    await admin.from("venue_reports").delete().in("venue_id", venues);
    await admin.from("events").delete().in("venue_id", venues);
    await admin.from("menu_items").delete().in("venue_id", venues);
    await admin.from("venue_users").delete().in("venue_id", venues);
    await admin.from("venues").delete().in("id", venues);
    for (const id of users) {
      await admin.from("event_planners").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
    const left = await admin.from("venues").select("id").ilike("name", `ZZ Test % ${stamp}`);
    ok("cleaned up after itself", (left.data ?? []).length === 0, `${(left.data ?? []).length} venues left`);
    for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  - " + r.detail : ""}`);
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
