/**
 * Give somebody unlimited chat, or take it away.
 *
 *   npm run grant -- list
 *   npm run grant -- pro you@example.com
 *   npm run grant -- free you@example.com
 *
 * This is how testing happens before there is anything to buy, and how a
 * refund or a goodwill month gets applied afterwards. Deliberately a script
 * and not a route: until the purchase path exists, the only way to become pro
 * should be a person with database access deciding so.
 *
 * It writes with the service role, which is the only thing that can: the
 * entitlements table grants no INSERT or UPDATE to anyone signed in, because a
 * user who can edit their own row can hand themselves the paid tier and the
 * paywall becomes a suggestion.
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

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const [command, email] = process.argv.slice(2);

  if (command === "list" || !command) {
    const { data } = await admin
      .from("entitlements")
      .select("user_id, tier, source, lifetime_messages_used, updated_at")
      .order("updated_at", { ascending: false });

    const rows = (data ?? []) as {
      user_id: string;
      tier: string;
      source: string | null;
      lifetime_messages_used: number;
    }[];

    if (!rows.length) {
      console.log("Nobody has chatted yet, so no entitlement rows exist.");
      return;
    }

    // The email lives on auth.users, which is not joinable from PostgREST.
    const { data: users } = await admin.auth.admin.listUsers();
    const emailOf = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? ""]));

    console.table(
      rows.map((r) => ({
        email: emailOf.get(r.user_id) ?? r.user_id,
        tier: r.tier,
        source: r.source ?? "",
        free_used: r.lifetime_messages_used,
      }))
    );
    return;
  }

  if (command !== "pro" && command !== "free") {
    console.error('Use "list", "pro <email>" or "free <email>".');
    process.exit(1);
  }
  if (!email) {
    console.error(`Which account? npm run grant -- ${command} you@example.com`);
    process.exit(1);
  }

  const { data: users, error } = await admin.auth.admin.listUsers();
  if (error) throw error;

  const user = (users?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exit(1);
  }

  const { error: writeError } = await admin.from("entitlements").upsert(
    {
      user_id: user.id,
      tier: command,
      status: "active",
      source: command === "pro" ? "grant" : null,
      expires_at: null,
    },
    { onConflict: "user_id" }
  );
  if (writeError) throw writeError;

  console.log(
    command === "pro"
      ? `${email} now has unlimited chat, up to the monthly fair-use cap.`
      : `${email} is back on the free tier. Their five lifetime messages are not reset by this.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
