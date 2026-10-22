/** Embed every active venue whose description changed (embeddings.ts). npm run embed:venues */
import { createClient } from "@supabase/supabase-js";
import { embedChangedVenues } from "../src/lib/embeddings";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
embedChangedVenues(db, 1000)
  .then((r) => console.log(r))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
