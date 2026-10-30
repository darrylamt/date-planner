/**
 * A one-off announcement push, to the phones Duro can reach.
 *
 *   npx tsx --env-file=.env.local scripts/announce.ts            what would be sent, to whom (counts only)
 *   npx tsx --env-file=.env.local scripts/announce.ts --send     send it to people who turned on Weekend ideas
 *   ... --send --everyone                                         send it to every phone with notifications on
 *
 * Promotional pushes need an opt-in (App Store 4.5.4); --everyone ignores
 * it, so it is never the default. A tap opens a new plan, counted in the
 * plan log as push_announce.
 */
import { createClient } from "@supabase/supabase-js";
import { sendExpoPush, type PushMessage } from "../src/lib/pushServer";

const TITLE = "Meals just got better";
const BODY = "Every plan now orders a proper meal. Plan one tonight?";
const URL = "/plan/new?fresh=1&from=push_announce";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

(async () => {
  const send = process.argv.includes("--send");
  const everyone = process.argv.includes("--everyone");

  const { data: tokens, error } = await db.from("push_tokens").select("token, user_id");
  if (error) throw new Error(error.message);
  let rows = (tokens ?? []) as { token: string; user_id: string }[];
  if (!everyone) {
    const { data: prefs } = await db.from("notification_prefs").select("user_id").eq("nudges", true);
    const on = new Set(((prefs ?? []) as { user_id: string }[]).map((p) => p.user_id));
    rows = rows.filter((r) => on.has(r.user_id));
  }

  console.log(`${TITLE}\n${BODY}\n-> ${URL}\n`);
  console.log(`${everyone ? "Every phone with notifications on" : "People who turned on Weekend ideas"}: ${new Set(rows.map((r) => r.user_id)).size} people, ${rows.length} phones.`);
  if (!send) {
    console.log("Dry run. Add --send to send it.");
    return;
  }
  if (!rows.length) {
    console.log("Nobody to send to.");
    return;
  }
  const messages: PushMessage[] = rows.map((r) => ({ to: r.token, title: TITLE, body: BODY, data: { url: URL } }));
  const { sent, failures } = await sendExpoPush(messages);
  console.log(`Sent ${sent} of ${messages.length}.${failures.length ? ` Failures: ${[...new Set(failures)].join("; ")}` : ""}`);
})();
