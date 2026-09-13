/**
 * Put real questions to the chat loop and print what comes back.
 *
 *   npm run chat:ask                      # the honesty set below
 *   npm run chat:ask -- "your question"   # one of your own
 *
 * This spends real credit, a fraction of a cent per question, and it is the
 * only way to know whether the thing works. Each question below is chosen to
 * fail loudly rather than plausibly: they cover a branch that owns no menu
 * rows, a venue with no hours recorded, a fact the schema does not hold, and a
 * restaurant that does not exist. The right answers are refusals.
 *
 * It is also the seed of the eval. When there are two providers to choose
 * between, this is the harness that decides it.
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

/** What we hope to see, for reading the output rather than for grading it. */
const QUESTIONS: { ask: string; looking_for: string }[] = [
  {
    ask: "What's on the menu at The Honeysuckle in Spintex?",
    looking_for: "Real dishes. That branch owns no menu rows; they live on the Osu row.",
  },
  {
    ask: "Is Daddy boba open on Monday at 9pm?",
    looking_for: "That we do not know its hours. Never 'closed'.",
  },
  {
    ask: "Somewhere in Osu with good vegan options?",
    looking_for: "That no dietary information is recorded. Not a guess from dish names.",
  },
  {
    ask: "Tell me about Nobu in Osu, is it any good?",
    looking_for: "That it is not in the catalogue. No invented description.",
  },
  {
    ask: "I have 200 cedis for two people. Is that enough for a night out?",
    looking_for: "A real floor from real venues, and what that floor is made of.",
  },
];

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { getProvider } = await import("../src/lib/chat/model");
  const { SYSTEM, buildOpeningContext } = await import("../src/lib/chat/system");
  const { runChat } = await import("../src/lib/chat/run");
  const { todayInAccra } = await import("../src/lib/chat/tools");
  const type = await import("../src/lib/chat/tools/types");
  void type;

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const today = todayInAccra();
  const ctx = {
    catalog: anon,
    admin: anon,
    userId: "00000000-0000-0000-0000-000000000000",
    today,
  };

  const { data: areas } = await anon.from("areas").select("name").order("name");
  const areaNames = ((areas ?? []) as { name: string }[]).map((a) => a.name);

  const provider = getProvider();
  console.log(`\nprovider: ${provider.id} / ${provider.model}\n`);

  const custom = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const asks = custom.length
    ? custom.map((ask) => ({ ask, looking_for: "" }))
    : QUESTIONS;

  let inTok = 0, outTok = 0, cacheRead = 0;

  for (const q of asks) {
    console.log(`\x1b[1m\x1b[36m? ${q.ask}\x1b[0m`);
    if (q.looking_for) console.log(`\x1b[2m  want: ${q.looking_for}\x1b[0m`);

    const userContent = `${buildOpeningContext(today, areaNames)}\n\n${q.ask}`;
    let answer = "";

    for await (const ev of runChat({ provider, system: SYSTEM, history: [], userContent, ctx })) {
      if (ev.type === "tool") console.log(`\x1b[2m  · ${ev.label} (${ev.name})\x1b[0m`);
      else if (ev.type === "text") answer += ev.text;
      else if (ev.type === "error") console.log(`\x1b[31m  error: ${ev.message}\x1b[0m`);
      else if (ev.type === "done") {
        for (const u of ev.usage) {
          inTok += u.input; outTok += u.output; cacheRead += u.cacheRead;
        }
      }
    }

    console.log(`\n  ${answer.trim().split("\n").join("\n  ")}\n`);
    console.log("\x1b[2m  " + "─".repeat(64) + "\x1b[0m");
  }

  // Sonnet 5 rates. The cache read line is the one that matters: zero across
  // repeated runs means the prefix is not caching and every turn pays full.
  const cost = (inTok * 2 + cacheRead * 0.2 + outTok * 10) / 1_000_000;
  console.log(
    `\ninput ${inTok}  ·  cache read ${cacheRead}  ·  output ${outTok}` +
      `\nabout $${cost.toFixed(4)} for ${asks.length} question${asks.length > 1 ? "s" : ""}` +
      (cacheRead === 0 ? "\n\x1b[33mcache read is 0: the prefix is not caching.\x1b[0m" : "")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
