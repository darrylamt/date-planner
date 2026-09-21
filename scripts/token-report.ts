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

  await everythingElse(cost);
}

/**
 * The other call sites, from 0053.
 *
 * Chat was never the expensive one; it was only the one that wrote anything
 * down. Reported beside it so the comparison is on the same screen, because
 * the mistake this whole exercise came from was reading one call site's
 * numbers as though they were the bill.
 */
async function everythingElse(chatCost: number) {
  const { data, error } = await admin
    .from("ai_usage")
    .select("call_site, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, ok, duration_ms");

  if (error) {
    console.log("\nOTHER CALL SITES");
    console.log("   ai_usage is not there yet -- run migration 0053.");
    return;
  }

  const rows = (data ?? []) as {
    call_site: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    ok: boolean;
    duration_ms: number | null;
  }[];

  if (!rows.length) {
    console.log("\nOTHER CALL SITES");
    console.log("   nothing logged yet. Generate a plan, or research a venue, and run this again.");
    return;
  }

  const bySite = new Map<string, { calls: number; cost: number; read: number; prompt: number; fails: number }>();
  let total = 0;

  for (const r of rows) {
    const price = PRICES[r.model] ?? FALLBACK;
    const c =
      (r.input_tokens * price.in +
        r.cache_read_tokens * price.in * 0.1 +
        r.cache_write_tokens * price.in * 1.25 +
        r.output_tokens * price.out) /
      1_000_000;
    total += c;
    const cur = bySite.get(r.call_site) ?? { calls: 0, cost: 0, read: 0, prompt: 0, fails: 0 };
    cur.calls += 1;
    cur.cost += c;
    cur.read += r.cache_read_tokens;
    cur.prompt += r.input_tokens + r.cache_read_tokens + r.cache_write_tokens;
    if (!r.ok) cur.fails += 1;
    bySite.set(r.call_site, cur);
  }

  console.log("\nOTHER CALL SITES");
  console.log("   site        calls     cost    cache%   failed");
  for (const [site, v] of [...bySite].sort((a, b) => b[1].cost - a[1].cost)) {
    const hit = v.prompt ? ((v.read / v.prompt) * 100).toFixed(0) : "0";
    console.log(
      `   ${site.padEnd(11)} ${String(v.calls).padStart(5)}  ${usd(v.cost).padStart(8)}  ${(hit + "%").padStart(6)}   ${v.fails}`
    );
  }
  console.log(`   ${"chat".padEnd(11)} ${"".padStart(5)}  ${usd(chatCost).padStart(8)}  (from messages.usage)`);
  console.log(`\n   everything logged: ${usd(total + chatCost)}`);
  console.log("   Compare against the console's monthly figure. A large gap is a call site still not logging.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
