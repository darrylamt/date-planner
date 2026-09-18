/**
 * Put an account against the paywall, or take it back off.
 *
 *   npm run paywall -- on you@example.com     # free tier, month spent
 *   npm run paywall -- off you@example.com    # pro again
 *
 * App Review wants a screenshot of the paywall, and the only honest way to get
 * one is to actually be behind it. Sending five messages to burn the allowance
 * would work and would also cost five model calls and leave a conversation
 * nobody wanted; this sets the counter directly.
 *
 * Deliberately a script rather than a debug button in the app. A switch that
 * fakes being out of messages is a switch that ships, and the paywall is the
 * one screen where what you see has to be what the server actually thinks.
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
  if (m) process.env[m[1]] = m[2].trim();
}

/** The same month the server counts against: UTC, which is Accra's calendar. */
function currentPeriodStart(): string {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { FREE_MONTHLY_MESSAGES } = await import("../src/lib/entitlements");

  const [command, email] = process.argv.slice(2);
  if (!["on", "off"].includes(command) || !email) {
    console.error("Usage: npm run paywall -- on|off you@example.com");
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  const user = users?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }

  const period = currentPeriodStart();

  if (command === "on") {
    await admin
      .from("entitlements")
      .upsert(
        { user_id: user.id, tier: "free", status: "none", expires_at: null },
        { onConflict: "user_id" }
      );
    await admin
      .from("chat_usage")
      .upsert(
        { user_id: user.id, period_start: period, messages_used: FREE_MONTHLY_MESSAGES },
        { onConflict: "user_id,period_start" }
      );

    console.log(`${email} is now on the free tier with ${period}'s ${FREE_MONTHLY_MESSAGES} spent.`);
    console.log("Open the chat and send one message: the paywall is the reply.");
    console.log("\nPut it back with:  npm run paywall -- off " + email);
    return;
  }

  await admin
    .from("entitlements")
    .upsert(
      { user_id: user.id, tier: "pro", status: "active", source: "admin", expires_at: null },
      { onConflict: "user_id" }
    );
  // Cleared rather than left at the cap, so pro is not immediately against its
  // own fair-use limit for the rest of the month.
  await admin
    .from("chat_usage")
    .upsert({ user_id: user.id, period_start: period, messages_used: 0 }, {
      onConflict: "user_id,period_start",
    });

  console.log(`${email} is pro again, and this month's count is cleared.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
