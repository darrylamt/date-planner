/**
 * Star lists and alerts (0113), checked live with two throwaway logins, one
 * free and one Pro, on the Duro Test Kitchen only:
 *
 * - lists are Pro, and each account sees only its own;
 * - the first look at a starred place is silent, and an event, a new dish
 *   and a price change after it make one alert, for Pro only.
 *
 * The run is limited to the two logins, so nobody real is alerted, and it
 * never sends a push (the Pro login's device is gone before the run that
 * writes). Everything it adds is removed. npm run stars:smoke
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runStarAlerts } from "../src/lib/starAlerts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -- ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

const made: string[] = [];
async function login(label: string, pro: boolean): Promise<{ db: SupabaseClient; id: string }> {
  const email = `zz-smoke-stars-${label}-${Date.now()}@stars.aduro.invalid`;
  const password = `Smoke-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create ${label}: ${error?.message}`);
  made.push(data.user.id);
  if (pro) {
    const { error: e } = await admin.from("entitlements").upsert({ user_id: data.user.id, tier: "pro", status: "active", source: "grant", expires_at: null }, { onConflict: "user_id" });
    if (e) throw new Error(`pro ${label}: ${e.message}`);
  }
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: s } = await db.auth.signInWithPassword({ email, password });
  if (s) throw new Error(`sign in ${label}: ${s.message}`);
  return { db, id: data.user.id };
}

(async () => {
  const { data: venue } = await admin.from("venues").select("id, name, area_id").ilike("name", "Duro Test Kitchen%").single();
  if (!venue) throw new Error("Duro Test Kitchen not found");
  const venueId = (venue as { id: string }).id;
  const { data: dish } = await admin.from("menu_items").select("id, price_ghs").eq("venue_id", venueId).limit(1).single();
  const oldPrice = (dish as { price_ghs: number }).price_ghs;
  let eventId: string | null = null;
  let newDishId: string | null = null;
  const date = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

  try {
    const free = await login("free", false);
    const pro = await login("pro", true);
    const users = [free.id, pro.id];

    console.log("\nLISTS");
    for (const u of [free, pro]) await u.db.from("venue_stars").insert({ user_id: u.id, venue_id: venueId });
    const f = await free.db.from("star_lists").insert({ user_id: free.id, name: "Mine" }).select("id").maybeSingle();
    check("a free account cannot make a list", Boolean(f.error && /star_lists_pro/.test(f.error.message)), f.error?.message);
    const p = await pro.db.from("star_lists").insert({ user_id: pro.id, name: "Date spots" }).select("id").single();
    check("a Pro account can", !p.error, p.error?.message);
    const listId = (p.data as { id: string } | null)?.id ?? "";
    const add = await pro.db.from("star_list_venues").insert({ list_id: listId, venue_id: venueId, user_id: pro.id });
    check("and put a place in it", !add.error, add.error?.message);
    const peek = await free.db.from("star_lists").select("id").eq("id", listId);
    check("another account cannot see it", (peek.data ?? []).length === 0);
    const sneak = await free.db.from("star_list_venues").insert({ list_id: listId, venue_id: venueId, user_id: free.id });
    check("or add to it", Boolean(sneak.error));
    const blank = await pro.db.from("star_lists").insert({ user_id: pro.id, name: "   " });
    check("a blank name is refused", Boolean(blank.error));

    console.log("\nALERTS");
    for (const u of [free, pro]) {
      const { error } = await u.db.from("notification_prefs").upsert({ user_id: u.id, star_alerts: true }, { onConflict: "user_id" });
      if (error) throw new Error(`prefs: ${error.message}`);
    }
    // Before the first look, the Test Kitchen's own history is not news to anybody.
    await admin.from("star_watch_seen").delete().eq("venue_id", venueId);
    const first = await runStarAlerts(admin, new Date(), { users, closedToo: true });
    check("the first look notes the place", first.baselined === 1, `baselined ${first.baselined}`);
    check("and says nothing", first.messages.length === 0);
    check("free accounts are not alerted", first.skipped["not Pro"] === 1, JSON.stringify(first.skipped));

    const ev = await admin.from("events").insert({ title: "Smoke Jazz Night", venue_id: venueId, area_id: (venue as { area_id: string }).area_id, event_date: date, start_time: "19:00", is_active: true, category: "other" }).select("id").single();
    if (ev.error) throw new Error(`event: ${ev.error.message}`);
    eventId = (ev.data as { id: string }).id;
    const nd = await admin.from("menu_items").insert({ venue_id: venueId, name: "Smoke Jollof", price_ghs: 99, category: "main" }).select("id").single();
    if (nd.error) throw new Error(`dish: ${nd.error.message}`);
    newDishId = (nd.data as { id: string }).id;
    await admin.from("menu_items").update({ price_ghs: Number(oldPrice) + 5 }).eq("id", (dish as { id: string }).id);

    await admin.from("push_tokens").insert({ token: `ExponentPushToken[smoke-${Date.now()}]`, user_id: pro.id, platform: "ios" });
    const dry = await runStarAlerts(admin, new Date(), { users, dry: true, closedToo: true });
    const mine = dry.messages.find((m) => m.userId === pro.id)?.alert;
    check("an event and a dish make an alert", Boolean(mine && /Smoke Jazz Night/.test(mine.body) && /Smoke Jollof/.test(mine.body)), JSON.stringify(mine));
    check("it opens the place", mine?.url === `/venue/${venueId}`);
    check("only for Pro", dry.messages.length === 1);

    await admin.from("push_tokens").delete().eq("user_id", pro.id);
    await runStarAlerts(admin, new Date(), { users, closedToo: true });
    const { data: noted } = await admin.from("star_watch_seen").select("kind, key, value").eq("venue_id", venueId);
    const rows = (noted ?? []) as { kind: string; key: string; value: string | null }[];
    check("a run notes the news as seen", rows.some((r) => r.kind === "event" && r.key.startsWith("smoke jazz night")) && rows.some((r) => r.kind === "dish" && r.key === "smoke jollof"));
    await admin.from("push_tokens").insert({ token: `ExponentPushToken[smoke2-${Date.now()}]`, user_id: pro.id, platform: "ios" });
    const again = await runStarAlerts(admin, new Date(), { users, dry: true, closedToo: true });
    check("so it is not news twice", again.messages.length === 0, JSON.stringify(again.skipped));
  } catch (e) {
    check("ran to the end", false, e instanceof Error ? e.message : String(e));
  } finally {
    if (eventId) await admin.from("events").delete().eq("id", eventId);
    if (newDishId) await admin.from("menu_items").delete().eq("id", newDishId);
    await admin.from("menu_items").update({ price_ghs: oldPrice }).eq("id", (dish as { id: string }).id);
    await admin.from("star_watch_seen").delete().eq("venue_id", venueId);
    for (const id of made) await admin.auth.admin.deleteUser(id);
    const { count } = await admin.from("star_lists").select("id", { count: "exact", head: true }).in("user_id", made);
    check("cleaned up after itself", (count ?? 0) === 0);
    console.log(`\n${passed}/${passed + failed} passed`);
    process.exit(failed ? 1 : 0);
  }
})();
