/**
 * Staff roles (0095), checked live: each role, signed in as itself, can do
 * its job on the Duro Test Kitchen and nothing else, and every change lands in
 * staff_edits. Creates throwaway logins and removes them, and puts the venue
 * back as it was. npm run staff:smoke
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
async function login(role: string): Promise<{ db: SupabaseClient; id: string }> {
  const email = `zz-smoke-${role}-${Date.now()}@staff.aduro.invalid`;
  const password = `Smoke-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create ${role}: ${error?.message}`);
  made.push(data.user.id);
  const { error: e } = await admin.from("staff_roles").insert({ user_id: data.user.id, role, username: `zz-smoke-${role}` });
  if (e) throw new Error(`role ${role}: ${e.message}`);
  const db = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: s } = await db.auth.signInWithPassword({ email, password });
  if (s) throw new Error(`sign in ${role}: ${s.message}`);
  return { db, id: data.user.id };
}

(async () => {
  const { data: venue } = await admin.from("venues").select("*").ilike("name", "Duro Test Kitchen%").single();
  if (!venue) throw new Error("Duro Test Kitchen not found");
  const v = venue as Record<string, any>;
  const restore = { name: v.name, image_url: v.image_url, aesthetics: v.aesthetics, avg_cost_per_person_ghs: v.avg_cost_per_person_ghs, description: v.description };

  try {
    console.log("\nPHOTOS");
    const photos = await login("photos");
    await photos.db.from("venues").update({ aesthetics: 4, name: "HACKED", description: "hacked" }).eq("id", v.id);
    let { data: after } = await admin.from("venues").select("name, aesthetics, description").eq("id", v.id).single();
    check("can set how it looks", after?.aesthetics === 4, `aesthetics ${after?.aesthetics}`);
    check("cannot rename the venue", after?.name === v.name, after?.name);
    check("cannot change the description", after?.description === v.description);
    const dish = await photos.db.from("menu_items").insert({ venue_id: v.id, name: "zz smoke", category: "main", price_ghs: 1 }).select();
    check("cannot add a dish", Boolean(dish.error) || !dish.data?.length, dish.error?.message ?? "");

    console.log("\nMENUS");
    const menus = await login("menus");
    const add = await menus.db.from("menu_items").insert({ venue_id: v.id, name: "zz smoke dish", category: "main", price_ghs: 42 }).select("id").single();
    check("can add a dish", !add.error && Boolean(add.data), add.error?.message ?? "");
    if (add.data) {
      const del = await menus.db.from("menu_items").delete().eq("id", add.data.id).select("id");
      check("can remove a dish", !del.error && del.data?.length === 1, del.error?.message ?? "");
    }
    await menus.db.from("venues").update({ avg_cost_per_person_ghs: 123, image_url: "https://example.com/hack.jpg", name: "HACKED" }).eq("id", v.id);
    ({ data: after } = await admin.from("venues").select("name, image_url, avg_cost_per_person_ghs").eq("id", v.id).single());
    check("can set the per-person price", Number((after as any)?.avg_cost_per_person_ghs) === 123);
    check("cannot change the photo", (after as any)?.image_url === v.image_url);
    check("cannot rename the venue", (after as any)?.name === v.name);

    console.log("\nEVENTS");
    const events = await login("events");
    const ev = await events.db
      .from("events")
      .insert({ title: "zz smoke night", venue_id: v.id, area_id: v.area_id, category: "other", event_date: "2099-01-01", is_active: false })
      .select("id")
      .single();
    check("can add an event", !ev.error && Boolean(ev.data), ev.error?.message ?? "");
    if (ev.data) {
      const del = await events.db.from("events").delete().eq("id", ev.data.id).select("id");
      check("can remove it", !del.error && del.data?.length === 1, del.error?.message ?? "");
    }
    const dish2 = await events.db.from("menu_items").insert({ venue_id: v.id, name: "zz smoke", category: "main", price_ghs: 1 }).select();
    check("cannot add a dish", Boolean(dish2.error) || !dish2.data?.length, dish2.error?.message ?? "");
    await events.db.from("venues").update({ name: "HACKED" }).eq("id", v.id);
    ({ data: after } = await admin.from("venues").select("name").eq("id", v.id).single());
    check("cannot touch the venue", (after as any)?.name === v.name);

    console.log("\nTHE LOG");
    const { data: log } = await admin.from("staff_edits").select("user_id, table_name, action, changes").in("user_id", made);
    const has = (uid: string, table: string, action: string) => (log ?? []).some((l) => l.user_id === uid && l.table_name === table && l.action === action);
    check("photos' change is logged", has(photos.id, "venues", "update"));
    check("only what changed is logged", (log ?? []).filter((l) => l.user_id === photos.id).every((l) => !("name" in (l.changes ?? {}))));
    check("menus' dish added and removed are logged", has(menus.id, "menu_items", "insert") && has(menus.id, "menu_items", "delete"));
    check("events' event is logged", has(events.id, "events", "insert"));

    console.log("\nNOBODY ELSE");
    const stranger = createClient(URL, ANON, { auth: { persistSession: false } });
    const s = await stranger.from("staff_roles").select("*");
    check("roles are not readable by the public", Boolean(s.error) || !s.data?.length, s.error?.message ?? "");
    const l = await stranger.from("staff_edits").select("*");
    check("the log is not readable by the public", Boolean(l.error) || !l.data?.length, l.error?.message ?? "");
  } finally {
    await admin.from("venues").update(restore).eq("id", v.id);
    await admin.from("menu_items").delete().eq("venue_id", v.id).like("name", "zz smoke%");
    await admin.from("events").delete().like("title", "zz smoke%");
    if (made.length) await admin.from("staff_edits").delete().in("user_id", made);
    for (const id of made) await admin.auth.admin.deleteUser(id);
    const { data: back } = await admin.from("venues").select("name, image_url, aesthetics, avg_cost_per_person_ghs").eq("id", v.id).single();
    check("venue put back as it was", JSON.stringify(back) === JSON.stringify({ name: restore.name, image_url: restore.image_url, aesthetics: restore.aesthetics, avg_cost_per_person_ghs: restore.avg_cost_per_person_ghs }), JSON.stringify(back));
    console.log(`\n${passed}/${passed + failed} passed`);
    if (failed) process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
