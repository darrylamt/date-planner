/**
 * Read every dish that has not been read, or has changed (menuUnderstand.ts).
 * npm run menu:understand -- [limit]
 */
import { createClient } from "@supabase/supabase-js";
import { understandMenus } from "../src/lib/menuUnderstand";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const limit = Number(process.argv[2] ?? 25000);
// "from-end" runs a second reader backwards from the end of the list, meeting the first.
understandMenus(db, { limit, fromEnd: process.argv.includes("from-end") })
  .then((r) => console.log(r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
