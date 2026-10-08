/**
 * The questions a new user is likely to ask Durobot first, run the way
 * /api/chat runs them: the same context line, live areas grouped by city.
 *
 *   npm run chat:first              # all of them, about 35 US cents
 *   npm run chat:first -- 3 9 22    # just those
 *   OUT=answers.txt npm run chat:first
 *
 * A first question answered "I can't" or answered wrong reads as a useless
 * bot, and this set found both: no events, no rooftops, plans for the wrong
 * day. Each answer prints with the tools it called and their arguments.
 */
import fs from "fs";
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { getProvider } = await import("../src/lib/chat/model");
const { SYSTEM, buildOpeningContext } = await import("../src/lib/chat/system");
const { runChat } = await import("../src/lib/chat/run");
const { todayInAccra } = await import("../src/lib/chat/tools");

const QUESTIONS: { ask: string; halloween?: boolean }[] = [
  { ask: "hi, what can you do?" },
  { ask: "Where should I take my girlfriend this Saturday?" },
  { ask: "where can I go tonight" },
  { ask: "best rated restaurants in Accra" },
  { ask: "cheapest restaurants in Osu" },
  { ask: "somewhere romantic in East Legon for dinner" },
  { ask: "where can I get good jollof" },
  { ask: "Plan a birthday dinner for 6 people on Friday, budget 1500 cedis" },
  { ask: "what's happening this weekend?" },
  { ask: "any rooftop bars in accra" },
  { ask: "where can I do karaoke" },
  { ask: "fun things to do in Accra that aren't just eating" },
  { ask: "best restaurants in Kumasi" },
  { ask: "where can I watch the football" },
  { ask: "cheap date ideas under 100 cedis" },
  { ask: "where can I get sushi" },
  { ask: "is Saint Pablo open on Sunday?" },
  { ask: "what's the most popular place on Duro" },
  { ask: "good brunch spots" },
  { ask: "somewhere I can take my kids this weekend" },
  { ask: "late night food after 11pm" },
  { ask: "anything for Halloween?", halloween: true },
];

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});
const today = todayInAccra();
const ctx = { catalog: anon, admin: anon, userId: "00000000-0000-0000-0000-000000000000", today } as never;

// Exactly as src/app/api/chat/route.ts builds it.
const { liveAreas } = await import("../src/lib/coverage");
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const areas = await liveAreas(service);
const byCity = new Map<string, string[]>();
for (const a of areas) {
  const c = a.city || "Accra";
  byCity.set(c, [...(byCity.get(c) ?? []), a.name]);
}
const areaNames = [...byCity].map(([c, names]) => (byCity.size > 1 ? `${c}: ${names.join(", ")}` : names.join(", ")));

const provider = getProvider();
const out: string[] = [`provider: ${provider.id} / ${provider.model}   today: ${today}\n`];
const log = (s: string) => {
  out.push(s);
  console.log(s);
};

let inTok = 0, outTok = 0, cacheRead = 0;
const only = process.argv.slice(2).map(Number).filter((n) => n > 0);

for (const [i, q] of QUESTIONS.entries()) {
  if (only.length && !only.includes(i + 1)) continue;
  log(`\n### ${i + 1}. ${q.ask}`);
  const userContent = `${buildOpeningContext(today, areaNames, { halloween: !!q.halloween, time: new Date().toISOString().slice(11, 16) })}\n\n${q.ask}`;
  let answer = "";
  const t0 = Date.now();
  for await (const ev of runChat({ provider, system: SYSTEM, history: [], userContent, ctx })) {
    if (ev.type === "plan") {
      const it = ev.itinerary as { title: string; est_total_ghs: number; stops: { name: string; area: string; arrival_time: string }[] };
      log(`  [plan] ${it.title}, GHS ${it.est_total_ghs}: ${it.stops.map((s) => `${s.arrival_time} ${s.name} (${s.area})`).join(" > ")}`);
    } else if (ev.type === "text") answer += ev.text;
    else if (ev.type === "error") log(`  ERROR: ${ev.message}`);
    else if (ev.type === "done") {
      for (const turn of ev.turns) {
        for (const b of turn.content) {
          if (b.type === "tool_use") log(`  > ${b.name} ${JSON.stringify(b.input)}`);
          if (b.type === "tool_result") {
            let summary = b.content.slice(0, 160);
            try {
              const r = JSON.parse(b.content);
              if (Array.isArray(r.venues)) summary = `${r.venues.length} venues: ${r.venues.map((v: { name: string }) => v.name).slice(0, 8).join(", ")}${r.note ? ` | note: ${String(r.note).slice(0, 120)}` : ""}`;
              else if (Array.isArray(r.items)) summary = `${r.items.length} items`;
            } catch {}
            log(`    < ${b.is_error ? "ERROR " : ""}${summary}`);
          }
        }
      }
      for (const u of ev.usage) {
        inTok += u.input; outTok += u.output; cacheRead += u.cacheRead;
      }
    }
  }
  log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)\n\n${answer.trim()}`);
}

const cost = (inTok * 2 + cacheRead * 0.2 + outTok * 10) / 1_000_000;
log(`\ninput ${inTok} · cache read ${cacheRead} · output ${outTok} · about $${cost.toFixed(4)}`);
if (process.env.OUT) fs.writeFileSync(process.env.OUT, out.join("\n"), "utf8");
