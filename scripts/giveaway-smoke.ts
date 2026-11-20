/**
 * Ticket giveaways (0117) end to end against the live site, without touching
 * a real giveaway:
 *
 *   npm run giveaway:smoke              # https://www.duroplans.com
 *   npm run giveaway:smoke -- <base>    # another deployment
 *
 * Makes two test giveaways on past events, throwaway accounts (some with a
 * made-up push token, which Expo simply rejects), and walks every answer:
 * signed out, no notifications, entered, a second tap, the winning entry,
 * after the win, the winner's page and picture, the forwarding link, and a
 * draw. Everything is named zz-test-* and removed in finally.
 */
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = (process.argv[2] ?? "https://www.duroplans.com").replace(/\/$/, "");
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const stamp = Date.now().toString(36);
const results: { name: string; pass: boolean; detail: string }[] = [];
const ok = (name: string, pass: boolean, detail: unknown = "") => results.push({ name, pass, detail: String(detail).slice(0, 160) });
const users: string[] = [];
const giveaways: string[] = [];

async function account(label: string, withToken: boolean): Promise<{ id: string; token: string }> {
  const email = `zz-test-give-${label}-${stamp}@venues.aduro.invalid`;
  const password = `test-${stamp}-Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  users.push(data.user.id);
  if (withToken) {
    const { error: tErr } = await admin
      .from("push_tokens")
      .insert({ token: `ExponentPushToken[zz-test-${label}-${stamp}]`, user_id: data.user.id, platform: "ios" });
    if (tErr) throw new Error(`push token ${label}: ${tErr.message}`);
  }
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await db.auth.signInWithPassword({ email, password });
  if (sErr || !s.session) throw new Error(`signIn ${label}: ${sErr?.message}`);
  return { id: data.user.id, token: s.session.access_token };
}

async function enter(eventId: string, bearer?: string): Promise<{ status: string; url: string | null }> {
  const res = await fetch(`${BASE}/api/giveaway/enter`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ eventId }),
  });
  return (await res.json()) as { status: string; url: string | null };
}

async function qrRows(text: string): Promise<string> {
  const m = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = m.modules.size;
  const rows: string[] = [];
  for (let r = 0; r < n; r++) {
    let row = "";
    for (let c = 0; c < n; c++) row += m.modules.get(r, c) ? "1" : "0";
    rows.push(row);
  }
  return rows.join(",");
}

async function main() {
  const { data: past } = await admin
    .from("events")
    .select("id")
    .lt("event_date", new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10))
    .order("event_date", { ascending: false })
    .limit(2);
  const [e1, e2] = ((past ?? []) as { id: string }[]).map((e) => e.id);
  if (!e1 || !e2) throw new Error("need two past events");
  const fallback = "https://example.com/zz-test-tickets";
  const later = new Date(Date.now() + 3600e3).toISOString();

  const { data: g1 } = await admin
    .from("giveaways")
    .insert({ event_id: e1, prize: "a zz-test prize", prize_qr: await qrRows(`zz-test-${stamp}`), fallback_url: fallback, win_at_entry: 2, draw_at: later })
    .select("id")
    .single();
  giveaways.push(g1!.id);

  const a = await account("a", true);
  const b = await account("b", true);
  const c = await account("c", false);

  const signedOut = await enter(e1);
  ok("signed out is not entered", signedOut.status === "signin" && signedOut.url === fallback, JSON.stringify(signedOut));
  const noPush = await enter(e1, c.token);
  ok("no notifications is not entered", noPush.status === "notifications" && noPush.url === fallback, JSON.stringify(noPush));
  const first = await enter(e1, a.token);
  ok("entry 1 of 2 goes to the normal ticket page", first.status === "entered" && first.url === fallback, JSON.stringify(first));
  const again = await enter(e1, a.token);
  ok("a second tap is not a second chance", again.status === "tried-before" && again.url === fallback, JSON.stringify(again));
  const second = await enter(e1, b.token);
  ok("entry 2 of 2 wins", second.status === "won" && /\/win\/[A-Za-z0-9_-]{16,}$/.test(second.url ?? ""), JSON.stringify(second));
  const after = await enter(e1, a.token);
  ok("after the win, others go to the normal page", after.status === "closed" && after.url === fallback, JSON.stringify(after));
  const winnerAgain = await enter(e1, b.token);
  ok("the winner tapping again gets their ticket back", winnerAgain.url === second.url, JSON.stringify(winnerAgain));

  const { data: row } = await admin.from("giveaways").select("winner_user_id, won_how, announced_at").eq("id", g1!.id).single();
  ok("winner recorded as entry", row?.winner_user_id === b.id && row?.won_how === "entry", JSON.stringify(row));
  ok("everyone who tried was told", Boolean(row?.announced_at), row?.announced_at);

  if (second.url) {
    const page = await fetch(second.url);
    const html = await page.text();
    ok("winner page opens", page.status === 200 && html.includes("You won") && html.includes("noindex"), page.status);
    const pic = await fetch(`${second.url}/ticket`);
    const bytes = (await pic.arrayBuffer()).byteLength;
    ok("saved ticket is a picture", pic.status === 200 && (pic.headers.get("content-type") ?? "").includes("image/png") && bytes > 10_000, `${pic.status} ${pic.headers.get("content-type")} ${bytes}`);
    fs.writeFileSync(path.join(process.env.TEMP ?? ".", `zz-giveaway-ticket-${stamp}.png`), Buffer.from(await (await fetch(`${second.url}/ticket`)).arrayBuffer()));
  }
  const wrong = await fetch(`${BASE}/win/zzzzzzzzzzzzzzzzzzzzzzzz`);
  ok("a made-up winner address is not found", wrong.status === 404, wrong.status);
  const fwd = await fetch(`${BASE}/win/e/${e1}`, { redirect: "manual" });
  ok("the ticket link off the app forwards to the normal page", fwd.status >= 300 && fwd.status < 400 && fwd.headers.get("location") === fallback, `${fwd.status} ${fwd.headers.get("location")}`);

  // The draw: fewer than N by the draw time, the next tap draws one of those who tried.
  const { data: g2 } = await admin
    .from("giveaways")
    .insert({ event_id: e2, prize: "a zz-test prize", prize_qr: await qrRows(`zz-test-2-${stamp}`), fallback_url: fallback, win_at_entry: 99, draw_at: later })
    .select("id")
    .single();
  giveaways.push(g2!.id);
  const tried = await enter(e2, a.token);
  ok("draw: entry under N goes to the normal page", tried.status === "entered", JSON.stringify(tried));
  await admin.from("giveaways").update({ draw_at: new Date(Date.now() - 60e3).toISOString() }).eq("id", g2!.id);
  const late = await enter(e2, b.token);
  ok("draw: a tap after the draw time is not entered", late.status === "closed" && late.url === fallback, JSON.stringify(late));
  const { data: drawn } = await admin.from("giveaways").select("winner_user_id, won_how, announced_at").eq("id", g2!.id).single();
  ok("draw: the one who tried is drawn and told", drawn?.winner_user_id === a.id && drawn?.won_how === "draw" && Boolean(drawn?.announced_at), JSON.stringify(drawn));
}

main()
  .catch((e) => ok("ran to the end", false, e instanceof Error ? e.message : e))
  .finally(async () => {
    for (const id of giveaways) await admin.from("giveaways").delete().eq("id", id);
    for (const id of users) {
      await admin.from("push_tokens").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
    for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : `  (${r.detail})`}`);
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
