/**
 * Does a RevenueCat purchase actually grant Pro?
 *
 *   npm run webhook:smoke -- <REVENUECAT_WEBHOOK_SECRET>
 *
 * Creates a throwaway user, posts the webhook event RevenueCat sends on a
 * first purchase, checks the entitlements row, posts the cancellation event,
 * checks it again, and deletes everything.
 *
 * ── why this is worth its own script ────────────────────────────────────
 * Every part of this chain fails silently. A wrong secret is a 401 that
 * RevenueCat retries for days without telling anybody. A missing row is a
 * paywall shown to somebody who has already paid. None of it surfaces in the
 * app, in App Store Connect, or in a build log -- the purchase succeeds,
 * Apple takes the money, and the only symptom is a user complaining.
 *
 * So the grant is exercised here, against the deployed endpoint, before a
 * real person is the one testing it.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const SECRET = process.argv[2] ?? env.REVENUECAT_WEBHOOK_SECRET ?? "";
const ENDPOINT =
  (env.EXPO_PUBLIC_API_URL || "https://date-plannergh.vercel.app").replace(/\/+$/, "") +
  "/api/webhooks/revenuecat";

async function post(event: Record<string, unknown>) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: SECRET },
    body: JSON.stringify({ event }),
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  if (!SECRET) {
    console.error("Pass the webhook secret as an argument.");
    process.exit(1);
  }

  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE,
    { auth: { persistSession: false } }
  );

  const stamp = Date.now().toString(36);
  const email = `zz-rc-${stamp}@example.com`;
  const results: [string, boolean, string][] = [];
  const ok = (name: string, pass: boolean, detail = "") => results.push([name, pass, detail]);

  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email,
    password: `rc-${stamp}-Aa1`,
    email_confirm: true,
  });
  if (cErr || !created?.user) {
    console.error("could not create the test user:", cErr?.message);
    process.exit(1);
  }
  const userId = created.user.id;

  try {
    // ── the purchase ─────────────────────────────────────────────────────
    const buy = await post({
      type: "INITIAL_PURCHASE",
      app_user_id: userId,
      store: "APP_STORE",
      expiration_at_ms: Date.now() + 30 * 864e5,
    });
    ok("webhook accepted the purchase", buy.status === 200, `HTTP ${buy.status} ${buy.body.slice(0, 60)}`);

    const { data: after } = await db
      .from("entitlements")
      .select("tier, status, source, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    ok("entitlement written as pro", after?.tier === "pro", `tier=${after?.tier ?? "no row"}`);
    ok("marked active", after?.status === "active", `status=${after?.status ?? "-"}`);
    ok("source recorded as the store", after?.source === "app_store", `source=${after?.source ?? "-"}`);
    ok("expiry carried across", Boolean(after?.expires_at), String(after?.expires_at ?? "null"));

    // ── the cancellation ─────────────────────────────────────────────────
    const gone = await post({
      type: "EXPIRATION",
      app_user_id: userId,
      store: "APP_STORE",
      expiration_at_ms: Date.now() - 1000,
    });
    ok("webhook accepted the expiry", gone.status === 200, `HTTP ${gone.status}`);

    const { data: lapsed } = await db
      .from("entitlements")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();
    ok(
      "pro removed on expiry",
      lapsed?.tier !== "pro" || lapsed?.status !== "active",
      `tier=${lapsed?.tier ?? "-"} status=${lapsed?.status ?? "-"}`
    );
  } finally {
    await db.from("entitlements").delete().eq("user_id", userId);
    await db.auth.admin.deleteUser(userId);
    const { data: left } = await db.from("entitlements").select("user_id").eq("user_id", userId);
    ok("cleaned up", (left ?? []).length === 0);
  }

  let bad = 0;
  for (const [name, pass, detail] of results) {
    if (!pass) bad++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  }
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
}

void main();
