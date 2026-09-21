/**
 * What the assistant actually costs, from what it actually recorded.
 *
 *   npm run tokens
 *
 * Every assistant turn writes its usage to messages.usage: input, output,
 * cacheRead, cacheWrite. That column exists for exactly this question, and it
 * is the only way to tell a cache that is working from one that is silently
 * off -- a prompt below the model's minimum cacheable length does not error,
 * it just never caches and bills full price every time.
 *
 * Prices are Anthropic's published rates for the model named in the row, so a
 * conversation run on a different model is costed on its own rates rather
 * than everything being averaged into one wrong number.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/** USD per million tokens. Cache reads are 0.1x input, writes 1.25x. */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const FALLBACK = { in: 2, out: 10 };

interface Usage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  model?: string;
  provider?: string;
}

function usd(n: number) {
  return `$${n.toFixed(4)}`;
}

async function main() {
  const { data, error } = await admin
    .from("messages")
    .select("conversation_id, role, usage, created_at")
    .not("usage", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("could not read messages:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as { conversation_id: string; usage: Usage }[];
  if (!rows.length) {
    console.log("No assistant turns have recorded usage yet.");
    return;
  }

  let input = 0;
  let output = 0;
  let read = 0;
  let write = 0;
  let cost = 0;
  const byModel = new Map<string, number>();
  /** Turns whose prefix was never cached at all, which is the number to watch. */
  let coldTurns = 0;

  const firstOfConversation = new Set<string>();
  const seen = new Set<string>();

  for (const r of rows) {
    const u = r.usage ?? {};
    const i = Number(u.input ?? 0);
    const o = Number(u.output ?? 0);
    const cr = Number(u.cacheRead ?? 0);
    const cw = Number(u.cacheWrite ?? 0);
    const model = u.model ?? "unknown";
    const p = PRICES[model] ?? FALLBACK;

    input += i;
    output += o;
    read += cr;
    write += cw;
    cost += (i * p.in + cr * p.in * 0.1 + cw * p.in * 1.25 + o * p.out) / 1_000_000;
    byModel.set(model, (byModel.get(model) ?? 0) + 1);
    if (cr === 0) coldTurns += 1;

    if (!seen.has(r.conversation_id)) {
      seen.add(r.conversation_id);
      firstOfConversation.add(r.conversation_id);
    }
  }

  const prompt = input + read + write;
  const turns = rows.length;

  console.log(`\n${turns} assistant turns across ${seen.size} conversations`);
  console.log(`models: ${[...byModel].map(([m, n]) => `${m} x${n}`).join(", ")}\n`);

  console.log("PROMPT TOKENS");
  console.log(`   uncached input   ${input.toLocaleString().padStart(10)}  ${((input / prompt) * 100).toFixed(1)}%`);
  console.log(`   cache reads      ${read.toLocaleString().padStart(10)}  ${((read / prompt) * 100).toFixed(1)}%   <- the hit rate`);
  console.log(`   cache writes     ${write.toLocaleString().padStart(10)}  ${((write / prompt) * 100).toFixed(1)}%`);
  console.log(`   total prompt     ${prompt.toLocaleString().padStart(10)}`);
  console.log(`   output           ${output.toLocaleString().padStart(10)}`);

  console.log("\nCACHE");
  console.log(`   turns with no cache read: ${coldTurns} of ${turns} (${((coldTurns / turns) * 100).toFixed(0)}%)`);
  console.log(`   first turns (always cold, nothing to reuse yet): ${firstOfConversation.size}`);
  console.log(
    `   cold turns that were NOT a first turn: ${coldTurns - firstOfConversation.size}  <- these are the expired or broken ones`
  );

  console.log("\nCOST");
  console.log(`   total            ${usd(cost)}`);
  console.log(`   per turn         ${usd(cost / turns)}`);
  console.log(`   per conversation ${usd(cost / seen.size)}`);

  /*
   * What perfect caching would have saved, as a ceiling on the work worth
   * doing. If this number is small, the cache is not where the money is.
   */
  const p = PRICES["claude-sonnet-5"] ?? FALLBACK;
  const ifAllCached = ((input * p.in * 0.1) / 1_000_000) - (input * p.in) / 1_000_000;
  console.log(`   ceiling if every uncached input token had been a cache read: ${usd(-ifAllCached)} saved`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
