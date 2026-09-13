/**
 * Exercise the chat tools against the live catalogue.
 *
 *   npx tsx scripts/chat-tools-smoke.ts
 *
 * Read-only. Checks the things that are invisible until they are wrong: that a
 * shared-menu branch resolves to its owner's menu, that unrecorded hours come
 * back as unknown rather than closed, that an estimated price is a range, and
 * that a dish nobody serves returns nothing instead of something similar.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local found. Run from the project root.");
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

import { searchVenues } from "../src/lib/chat/tools/searchVenues";
import { getVenue } from "../src/lib/chat/tools/getVenue";
import { searchMenuItems } from "../src/lib/chat/tools/searchMenuItems";
import { checkOpeningHours } from "../src/lib/chat/tools/checkOpeningHours";
import { estimateBudget } from "../src/lib/chat/tools/estimateBudget";
import type { ToolContext } from "../src/lib/chat/tools/types";

/*
 * Anon, exactly as a tool run sees it in production, so the column grants are
 * under test too: anything phone_pending or verification_* would fail here.
 */
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

const ctx: ToolContext = {
  catalog: anon,
  admin: anon, // no user-scoped tool in this phase
  userId: "00000000-0000-0000-0000-000000000000",
  today: new Date().toISOString().slice(0, 10),
};

function show(label: string, value: unknown) {
  console.log(`\n\x1b[1m── ${label}\x1b[0m`);
  console.log(JSON.stringify(value, null, 2).slice(0, 2200));
}

async function main() {
  // 1. A plain search.
  const search = await searchVenues.run(
    { areas: ["Osu"], vibes: ["romantic"], party_size: 2 },
    ctx
  );
  show("search_venues: romantic, Osu, two people", search);

  // 2. The branch test. A Honeysuckle that is not Osu must still have a menu.
  const { data: branches } = await anon
    .from("venues")
    .select("id,name,menu_shared_from")
    .not("menu_shared_from", "is", null)
    .limit(3);

  console.log("\n\x1b[1m── branches on file\x1b[0m");
  console.table(branches ?? []);

  if (branches?.length) {
    const branch = branches[0] as { id: string; name: string };
    const detail = (await getVenue.run({ venue_id: branch.id }, ctx)) as {
      name: string;
      menu?: { category: string; count: number; price_range_ghs: [number, number] }[];
      menu_shared_from: string | null;
    };
    const total = (detail.menu ?? []).reduce((n, c) => n + c.count, 0);
    console.log(
      `\n\x1b[1m── get_venue on a branch: ${detail.name}\x1b[0m\n` +
        `menu borrowed from: ${detail.menu_shared_from}\n` +
        `items resolved: ${total}  ${total > 0 ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL - branch reads as having no menu\x1b[0m"}`
    );
    console.table(detail.menu ?? []);
  } else {
    console.log("\n(no shared-menu branches on file, skipping the branch test)");
  }

  // 3. A dish that exists, and one that does not.
  show("search_menu_items: jollof", await searchMenuItems.run({ query: "jollof" }, ctx));
  show(
    "search_menu_items: something nobody serves",
    await searchMenuItems.run({ query: "haggis" }, ctx)
  );

  // 4. Hours, including the unknown case.
  const { data: noHours } = await anon
    .from("venues")
    .select("id,name")
    .is("opening_periods", null)
    .limit(1);

  if (noHours?.length) {
    const v = noHours[0] as { id: string; name: string };
    const res = (await checkOpeningHours.run(
      { venue_id: v.id, date: ctx.today, time: "20:00" },
      ctx
    )) as { state: string };
    console.log(
      `\n\x1b[1m── check_opening_hours on a venue with no hours: ${v.name}\x1b[0m\n` +
        `state: ${res.state}  ${res.state === "unknown" ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL - must be unknown, never closed\x1b[0m"}`
    );
  } else {
    console.log("\n(every venue has hours on file, skipping the unknown-hours test)");
  }

  // 5. Budget honesty, at a figure that should not work.
  show("estimate_budget: two people, two stops", await estimateBudget.run(
    { party_size: 2, stops: 2, budget_ghs: 150 },
    ctx
  ));

  // 6. The phone gate. Reading a withheld column must fail outright.
  const leak = await anon.from("venues").select("id,phone_pending").limit(1);
  console.log(
    `\n\x1b[1m── phone_pending through the anon key\x1b[0m\n` +
      (leak.error
        ? `\x1b[32mPASS\x1b[0m refused: ${leak.error.message}`
        : `\x1b[31mFAIL\x1b[0m readable: ${JSON.stringify(leak.data)}`)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
