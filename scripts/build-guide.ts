/**
 * The Ghana guide Durobot answers from (src/lib/chat/guide.json), built from
 * the research file scripts/data/ghana-guide-2026-11.json.
 *
 *   npx tsx scripts/build-guide.ts
 *
 * Only facts with a source go in. Drafts (draft: true) are the owner's to
 * check: when one is confirmed, remove its "draft" flag (and fix its text)
 * in the research file, then run this again. Internal notes stay behind;
 * each fact carries its sources' names, links and dates.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Source = { name: string; url: string | null; dated: string };
type Entry = {
  topic: string;
  title: string;
  body: string;
  place?: string;
  time?: string;
  source?: string[];
  source_url?: string;
  check?: boolean;
  draft?: boolean;
};

const research = JSON.parse(readFileSync("scripts/data/ghana-guide-2026-11.json", "utf8")) as {
  read_on: string;
  sources: Record<string, Source>;
  entries: Entry[];
};

const out = research.entries
  .filter((e) => !e.draft)
  .map((e) => {
    const sources = (e.source ?? []).map((k) => research.sources[k]).filter(Boolean);
    if (e.source_url) sources.push({ name: new URL(e.source_url).hostname.replace(/^www\./, ""), url: e.source_url, dated: `read ${research.read_on}` });
    return {
      topic: e.topic,
      title: e.title,
      fact: e.body,
      ...(e.place ? { place: e.place } : {}),
      ...(e.time ? { time: e.time } : {}),
      sources: sources.map((s) => ({ name: s.name, ...(s.url ? { url: s.url } : {}), dated: s.dated })),
      // Sources disagree or a detail is unread: the answer says so.
      ...(e.check ? { unconfirmed: true } : {}),
    };
  })
  .filter((e) => e.sources.length);

writeFileSync("src/lib/chat/guide.json", JSON.stringify({ read_on: research.read_on, facts: out }, null, 1) + "\n", "utf8");
console.log(`${out.length} facts written (${research.entries.length - out.length} drafts or unsourced left out)`);
