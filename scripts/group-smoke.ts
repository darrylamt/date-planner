/**
 * Group outings, end to end, against a running server.
 *
 *   GROUP_SMOKE_BASE=http://localhost:3000 npx tsx scripts/group-smoke.ts    (npm run group:smoke)
 *
 * Creates throwaway accounts (zz-test-*), runs a whole group through the real
 * routes, and checks the privacy promises as well as the happy path: nobody
 * sees anyone else's budget or order, tokens work once and only for their own
 * member, the free limit holds, and the tables cannot be touched directly.
 * Everything it creates is removed in finally, even when a check throws.
 */
import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = (process.env.GROUP_SMOKE_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const stamp = Date.now().toString(36);
const results: { name: string; pass: boolean; detail: string }[] = [];
const ok = (name: string, pass: boolean, detail: unknown = "") => results.push({ name, pass, detail: String(detail ?? "").slice(0, 200) });
const users: string[] = [];
const codes: string[] = [];

async function account(label: string): Promise<{ id: string; token: string; db: SupabaseClient }> {
  const email = `zz-test-${label}-${stamp}@venues.aduro.invalid`;
  const password = `test-${stamp}-Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  users.push(data.user.id);
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: s, error: e } = await db.auth.signInWithPassword({ email, password });
  if (e || !s.session) throw new Error(`signIn ${label}: ${e?.message}`);
  return { id: data.user.id, token: s.session.access_token, db };
}

async function call(method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, json };
}

/** Every key and string in a value, for "does this mention X anywhere". */
function deepText(v: unknown): string {
  return JSON.stringify(v ?? null).toLowerCase();
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const { data: osu } = await admin.from("areas").select("id").eq("name", "Osu").maybeSingle();
  const organiser = await account("org");
  const bearer = { Authorization: `Bearer ${organiser.token}` };

  // An anonymous session may not start a group.
  const anonDb = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: anon } = await anonDb.auth.signInAnonymously();
  if (anon.user) users.push(anon.user.id);
  const draft = {
    occasion: "friend_outing",
    title: "zz test night",
    dateFrom: day(3),
    dateTo: day(5),
    areaHintId: osu?.id ?? null,
    deadline: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    expected: 4,
    organiserName: "Organiser",
  };
  if (anon.session) {
    const r = await call("POST", "/api/groups", draft, { Authorization: `Bearer ${anon.session.access_token}` });
    ok("anonymous session cannot start a group", r.status === 403, r.status);
  }

  // Free limit: two, then 402.
  const a = await call("POST", "/api/groups", draft, bearer);
  ok("organiser starts a group", a.status === 201 && a.json?.code, JSON.stringify(a.json));
  const code: string = a.json?.code;
  codes.push(code);
  // The second group offers chosen days rather than a range (0084).
  const { dateFrom: _f, dateTo: _t, ...noRange } = draft;
  void _f;
  void _t;
  const b = await call("POST", "/api/groups", { ...noRange, days: [day(9), day(4)] }, bearer);
  if (b.json?.code) codes.push(b.json.code);
  const bPub = b.json?.code ? await call("GET", `/api/groups/${b.json.code}`) : null;
  ok("a group can offer chosen days", JSON.stringify(bPub?.json?.days) === JSON.stringify([day(4), day(9)]), JSON.stringify(bPub?.json?.days));
  const c = await call("POST", "/api/groups", draft, bearer);
  if (c.json?.code) codes.push(c.json.code);
  ok("third active group on a free account is refused", c.status === 402 && c.json?.error === "groups_limit", c.status);

  // The organiser answers in the app.
  const avail = { [day(3)]: ["evening"], [day(4)]: ["day"] };
  const orgAnswer = await call(
    "PUT",
    `/api/groups/${code}/answer`,
    { name: "Organiser", availability: avail, budget: 900, vibes: ["Fun"], hardNos: [], tags: [], fromAreaId: osu?.id ?? null },
    bearer
  );
  ok("organiser answers", orgAnswer.status === 200 && !orgAnswer.json?.token, JSON.stringify(orgAnswer.json));

  // Three friends on the web, one in the app.
  const web: { name: string; budget: number; token: string; memberId: string }[] = [];
  for (const [i, budget] of [150, 600, 2400].entries()) {
    const name = `Friend${i + 1}`;
    const r = await call("PUT", `/api/groups/${code}/answer`, {
      name,
      availability: avail,
      budget,
      vibes: ["Lively", "Foodie"],
      hardNos: i === 0 ? ["no_seafood"] : [],
      tags: i === 1 ? ["no pork please"] : [],
      fromAreaId: null,
    });
    ok(`${name} answers on the web and gets a token`, r.status === 200 && typeof r.json?.token === "string", r.status);
    web.push({ name, budget, token: r.json?.token, memberId: r.json?.memberId });
  }
  const again = await call("PUT", `/api/groups/${code}/answer`, { name: "Friend9", availability: avail, budget: 300 }, { "X-Group-Token": web[0].token });
  ok("an edit with a token returns no new token", again.status === 200 && !again.json?.token, JSON.stringify(again.json));
  const dup = await call("PUT", `/api/groups/${code}/answer`, { name: "friend2", availability: avail, budget: 300 });
  ok("a duplicate name is refused", dup.status === 409 && dup.json?.error === "name_taken", dup.status);
  // Put Friend1's name back.
  await call("PUT", `/api/groups/${code}/answer`, { name: "Friend1", availability: avail, budget: 150, hardNos: ["no_seafood"] }, { "X-Group-Token": web[0].token });

  const appFriend = await account("app");
  const appAnswer = await call(
    "PUT",
    `/api/groups/${code}/answer`,
    { name: "AppFriend", availability: avail, budget: 450, vibes: ["Chill"], hardNos: ["no_alcohol"], tags: [] },
    { Authorization: `Bearer ${appFriend.token}` }
  );
  ok("a friend answers in the app with no token back", appAnswer.status === 200 && !appAnswer.json?.token, JSON.stringify(appAnswer.json));

  // Public view: no budgets, no tokens, no orders.
  const pub = await call("GET", `/api/groups/${code}`);
  const pubText = deepText(pub.json);
  ok("public view lists who answered", pub.status === 200 && pub.json?.answered?.length === 5, JSON.stringify(pub.json?.answered));
  ok("public view carries no budget, token or order", !/budget_ghs|"budget"|token|"orders?"|2400/.test(pubText), pubText.slice(0, 160));

  // Only the organiser sees the tally, and it carries no budget either.
  const notOrg = await call("GET", `/api/groups/${code}/organiser`, undefined, { Authorization: `Bearer ${appFriend.token}` });
  ok("a member cannot open the organiser view", notOrg.status === 403, notOrg.status);
  const orgView = await call("GET", `/api/groups/${code}/organiser`, undefined, bearer);
  ok("organiser view works", orgView.status === 200 && orgView.json?.members?.length === 5, orgView.status);
  ok("organiser view carries no budget", !/budget_ghs|"budget"|2400/.test(deepText(orgView.json)), "");
  ok("organiser sees the typed hard no matched", (orgView.json?.hardNos ?? []).some((h: any) => h.id === "no_pork"), JSON.stringify(orgView.json?.hardNos));

  // Recommend: organiser only.
  const notOrgRec = await call("POST", `/api/groups/${code}/recommend`, {}, { Authorization: `Bearer ${appFriend.token}` });
  ok("a member cannot ask for a plan", notOrgRec.status === 403, notOrgRec.status);
  const rec = await call("POST", `/api/groups/${code}/recommend`, { ai: false }, bearer);
  ok("organiser gets a plan or a clean no-match", rec.status === 200 && (rec.json?.status === "ok" || rec.json?.status === "no_match"), JSON.stringify(rec.json).slice(0, 200));
  if (rec.json?.status === "no_match") ok("no-match states no figures", !/\d{2,}/.test(`${rec.json.headline} ${rec.json.message}`), rec.json.message);

  if (rec.json?.status === "ok") {
    const it = rec.json.proposal.itinerary;
    ok("shared plan carries the fixed budget note", /everyone's budget/i.test(it.budget_note ?? ""), it.budget_note);
    ok("shared plan has no alternates", it.stops.every((s: any) => !(s.alternates ?? []).length), "");
    ok("shared plan marks personal stops", it.stops.some((s: any) => s.own_orders), "");

    // Each member's own order: theirs only, within their budget.
    const mine: Record<string, any> = {};
    for (const w of web) {
      const r = await call("GET", `/api/groups/${code}/me`, undefined, { "X-Group-Token": w.token });
      mine[w.name] = r.json;
      ok(`${w.name} sees only their own order, within budget`, r.status === 200 && (r.json?.order === null || r.json.order.total_ghs <= w.budget), r.json?.order?.total_ghs);
    }
    ok("before lock, members other than the organiser see no order", Object.values(mine).every((m: any) => m.order === null), "");
    const orgMe = await call("GET", `/api/groups/${code}/me`, undefined, bearer);
    ok("organiser sees their own proposed order within budget", orgMe.json?.order && orgMe.json.order.total_ghs <= 900, orgMe.json?.order?.total_ghs);

    // A new answer makes the proposal stale.
    await call("PUT", `/api/groups/${code}/answer`, { name: "Friend3", availability: avail, budget: 2350 }, { "X-Group-Token": web[2].token });
    const stale = await call("POST", `/api/groups/${code}/lock`, { planId: rec.json.proposal.planId }, bearer);
    ok("locking a plan made from older answers is refused", stale.status === 409 && stale.json?.error === "stale", stale.status);

    const rec2 = await call("POST", `/api/groups/${code}/recommend`, { ai: false }, bearer);
    if (rec2.json?.status === "ok") {
      const lock = await call("POST", `/api/groups/${code}/lock`, { planId: rec2.json.proposal.planId }, bearer);
      ok("organiser locks the plan", lock.status === 200 && lock.json?.slug, JSON.stringify(lock.json));
      const relock = await call("POST", `/api/groups/${code}/lock`, { planId: rec2.json.proposal.planId }, bearer);
      ok("locking twice returns the same plan", relock.json?.slug === lock.json?.slug, relock.json?.slug);
      const { data: planRow } = await admin.from("plans").select("group_id, inputs, itinerary, total_budget_ghs").eq("share_slug", lock.json?.slug).maybeSingle();
      ok("saved plan is linked to the group", Boolean(planRow?.group_id), "");
      ok("saved plan's budget is what everyone pays, not anyone's own", planRow?.total_budget_ghs === planRow?.itinerary?.est_total_ghs, planRow?.total_budget_ghs);
      ok("saved plan carries names for the bill", (planRow?.inputs?.companions ?? []).includes("Me"), JSON.stringify(planRow?.inputs?.companions));
      for (const w of web) {
        const r = await call("GET", `/api/groups/${code}/me`, undefined, { "X-Group-Token": w.token });
        const others = web.filter((x) => x.memberId !== w.memberId).map((x) => x.memberId);
        ok(`${w.name}'s locked order is theirs alone`, r.status === 200 && !others.some((id) => deepText(r.json).includes(id)) && (r.json?.order === null || r.json.order.total_ghs <= (w.name === "Friend3" ? 2350 : w.budget)), r.json?.order?.total_ghs);
      }
      const late = await call("PUT", `/api/groups/${code}/answer`, { name: "Latecomer", availability: avail, budget: 300 });
      ok("answering after lock is refused", late.status === 409, late.status);
    } else {
      ok("second plan for locking", false, JSON.stringify(rec2.json).slice(0, 200));
    }
  }

  // Wrong tokens get nothing.
  const wrong = await call("GET", `/api/groups/${code}/me`, undefined, { "X-Group-Token": "not-a-real-token" });
  ok("a made-up token reads nothing", wrong.status === 403, wrong.status);

  // The tables are closed to direct calls, signed out and signed in.
  for (const t of ["groups", "group_members", "group_member_secrets", "group_plans", "group_plan_orders", "group_notifications"]) {
    const { data: d1, error: e1 } = await anonDb.from(t).select("*").limit(1);
    const { data: d2, error: e2 } = await appFriend.db.from(t).select("*").limit(1);
    ok(`${t} is closed to direct reads`, (Boolean(e1) || !(d1 ?? []).length) && (Boolean(e2) || !(d2 ?? []).length), e1?.message ?? e2?.message ?? "");
  }
  const { error: rpcErr } = await appFriend.db.rpc("group_create", {
    p_owner: appFriend.id, p_code: "AAAAAAAAAAAAAAAA", p_occasion: "friend_outing", p_title: null,
    p_date_from: day(3), p_date_to: day(4), p_area_hint: null, p_deadline: new Date().toISOString(),
    p_expected: null, p_name: "x", p_limit: null,
  });
  ok("group_create cannot be called directly", Boolean(rpcErr), rpcErr?.message ?? "it ran");

  // Group full at twelve. Filled straight in the table, because the answer
  // route rightly stops one device adding more than eight people a day.
  if (codes[1]) {
    const { data: g } = await admin.from("groups").select("id").eq("code", codes[1]).maybeSingle();
    for (let i = 0; i < 11; i++) {
      await admin.from("group_members").insert({ group_id: g!.id, name: `Filler${i}`, answered_at: new Date().toISOString() });
    }
    const { count } = await admin.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", g!.id);
    const r = await call("PUT", `/api/groups/${codes[1]}/answer`, { name: "Thirteenth", availability: { [day(3)]: ["evening"] }, budget: 100 });
    ok("a group stops at twelve", count === 12 && r.status === 409 && r.json?.error === "group_full", `${count} members, then ${r.status} ${r.json?.error}`);
  }
}

main()
  .catch((e) => ok("ran to completion", false, e instanceof Error ? e.message : String(e)))
  .finally(async () => {
    for (const code of codes) {
      const { data: g } = await admin.from("groups").select("id").eq("code", code).maybeSingle();
      if (g) {
        await admin.from("plans").delete().eq("group_id", g.id);
        await admin.from("groups").delete().eq("id", g.id);
      }
    }
    for (const id of users) await admin.auth.admin.deleteUser(id);
    const { count } = await admin.from("groups").select("id", { count: "exact", head: true }).ilike("title", "zz test%");
    ok("cleaned up after itself", (count ?? 0) === 0, `${count} groups left`);
    for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  - " + r.detail : ""}`);
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
