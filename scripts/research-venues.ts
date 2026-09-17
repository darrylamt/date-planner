/**
 * Fill in what nobody has recorded about a venue: how it feels, how dressed up
 * it is, what kind of kitchen, and where to find it on Instagram.
 *
 *   npm run research:venues -- --dry --limit 5    # look, write nothing
 *   npm run research:venues -- --limit 20         # do twenty
 *   npm run research:venues                       # do the lot
 *   npm run research:venues -- --name "Casa"      # one venue by name
 *
 * ── what it will and will not touch ─────────────────────────────────────
 * Only blanks. A field somebody has already filled is never overwritten,
 * because a human judgement about a place beats a search result about it, and
 * the point of this is the 161 venues where there is no judgement at all.
 *
 * It never touches prices and never touches phone numbers. Prices are the one
 * thing this catalogue refuses to guess at, and a phone number has its own
 * gate that only a person may open. Nothing here goes near either.
 *
 * ── NOT RUN YET, and why ────────────────────────────────────────────────
 * Every trial call came back "server tool use limit exceeded": web search is
 * capped at the account level, so the searches returned nothing while the
 * input tokens were still billed. The model did the right thing and reported
 * confidence 0 rather than filling the fields in from memory, which is the
 * behaviour the prompt is built around, but nothing useful came back.
 *
 * It is also dearer than it looks. Search results are billed as input, and at
 * four searches a venue that came to roughly 150,000 input tokens each, about
 * $55 across the catalogue rather than the $8 first estimated. Two searches
 * and an accumulating rather than rebuilt turn brought it down; measure again
 * before running the lot.
 *
 * ── on the model ────────────────────────────────────────────────────────
 * Sonnet rather than the Opus that research.ts uses. That one drafts a whole
 * venue from nothing, for a person who is about to read every field; this
 * fills characterisation gaps across the whole catalogue, and at a hundred and
 * sixty venues the difference is roughly $25 against $8. Getting "upscale"
 * slightly wrong costs a plan that reads a little off. It is not the kind of
 * mistake worth Opus money at that volume.
 */
import fs from "fs";
import path from "path";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local found. Run from the project root.");
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : undefined;
const nameAt = args.indexOf("--name");
const nameLike = nameAt >= 0 ? args[nameAt + 1] : undefined;

const MODEL = "claude-sonnet-5";

/**
 * Searches per venue.
 *
 * The single biggest cost here is not the model, it is what the searches drag
 * back: results are billed as input, and four searches a venue came to about
 * 150,000 input tokens each. Two is enough to find a restaurant's own
 * Instagram and a listing, which is what most of these fields come from.
 */
const SEARCHES = 2;

interface V {
  id: string;
  name: string;
  type: string;
  area: string;
  cuisine: string | null;
  aesthetics: number | null;
  dress_code: string | null;
  vibe_tags: string[] | null;
  best_for: string[] | null;
  instagram_handle: string | null;
  description: string | null;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { anthropic, parseModelJson, textFromResponse } = await import("../src/lib/anthropic");
  const { VENUE_VIBE_TAGS, BEST_FOR } = await import("../src/lib/catalog");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const found = z.object({
    cuisine: z.enum(["local", "continental", "both"]).nullable(),
    aesthetics: z.number().int().min(1).max(5).nullable(),
    dress_code: z.string().max(60).nullable(),
    vibe_tags: z.array(z.enum(VENUE_VIBE_TAGS)).max(6),
    best_for: z.array(z.enum(BEST_FOR)).max(4),
    instagram_handle: z.string().max(40).nullable(),
    // Generous, then trimmed on the way in. A model that writes 340
    // characters has still done the research; throwing the whole venue
    // away over the last forty is losing the work to keep the rule.
    description: z.string().max(600).nullable(),
    /** How much of this the search actually supported. */
    confidence: z.number().min(0).max(1),
    notes: z.string().max(300).nullable().default(null),
  });

  let q = admin
    .from("venues")
    .select(
      "id,name,type,cuisine,aesthetics,dress_code,vibe_tags,best_for,instagram_handle,description,areas(name)"
    )
    .eq("is_active", true)
    .in("type", ["restaurant", "cafe", "lounge", "dessert"])
    .order("name");

  if (nameLike) q = q.ilike("name", `%${nameLike}%`);

  const { data, error } = await q;
  if (error) {
    console.error("Could not load venues:", error.message);
    process.exit(1);
  }

  const rows = ((data ?? []) as unknown as (V & { areas: { name: string } | null })[]).map((v) => ({
    ...v,
    area: v.areas?.name ?? "Accra",
  }));

  const needing = rows
    .filter(
      (v) =>
        v.cuisine == null ||
        v.aesthetics == null ||
        !v.dress_code ||
        !v.instagram_handle ||
        !v.description?.trim() ||
        (v.vibe_tags?.length ?? 0) < 3 ||
        !v.best_for?.length
    )
    .slice(0, limit);

  if (!needing.length) {
    console.log("Nothing left with gaps.");
    return;
  }

  console.log(
    `${needing.length} venue(s) to research on ${MODEL}${dry ? " (dry run)" : ""}.\n`
  );

  let filled = 0;
  let thin = 0;
  let failed = 0;
  let inTok = 0;
  let outTok = 0;

  for (const v of needing) {
    const prompt = `Research this venue in Accra, Ghana and report only what you can actually find.

VENUE: ${v.name}
AREA: ${v.area}
KIND: ${v.type}

Search for it. Use its own Instagram, its website, Google listings and reviews.

Report, as JSON and nothing else:
{
  "cuisine": "local" | "continental" | "both" | null,
  "aesthetics": 1-5 | null,
  "dress_code": string | null,
  "vibe_tags": string[],
  "best_for": string[],
  "instagram_handle": string | null,
  "description": string | null,
  "confidence": 0-1,
  "notes": string | null
}

Rules:
- null is always available and always better than a guess. A venue you cannot find much about should come back mostly null with a low confidence, not filled in plausibly.
- cuisine: "local" is Ghanaian and West African, "continental" is everything else, "both" is a menu that genuinely does both. Null if you cannot tell.
- aesthetics: 5 is somewhere worth photographing, 1 is somewhere the food has to carry alone. Null if you have not seen it.
- dress_code: only if the venue states one, in its own words, e.g. "smart casual". Null otherwise. Do not invent a policy.
- vibe_tags: choose only from ${VENUE_VIBE_TAGS.join(", ")}. Two to four that genuinely fit. Do not stretch: a quiet cafe is not "lively" because it is busy at lunch.
- best_for: choose only from ${BEST_FOR.join(", ")}.
- instagram_handle: without the @, and only if you are confident it is this venue's own account and not a tag, a reposter or another branch.
- description: ONE sentence, under 200 characters, on what the place actually is. British spelling, no marketing words. Never "hidden gem", "nestled", "vibrant".
- confidence: how much of the above the search genuinely supported.`;

    try {
      let response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: SEARCHES }],
        messages: [{ role: "user", content: prompt }],
      });

      /*
       * Server tools hand back pause_turn mid-search, so the turn is driven to
       * completion. The conversation is accumulated rather than rebuilt: the
       * first version replaced the assistant turn each round, which resent
       * every search result already paid for and billed them again. Four
       * venues came to 600,000 input tokens that way.
       */
      let guard = 0;
      const turns: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
      while (response.stop_reason === "pause_turn" && guard++ < 3) {
        turns.push({ role: "assistant", content: response.content });
        response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 4000,
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: SEARCHES }],
          messages: turns,
        });
      }

      inTok += response.usage.input_tokens;
      outTok += response.usage.output_tokens;

      const parsed = found.parse(parseModelJson(textFromResponse(response)));

      /*
       * Blanks only. Somebody who decided a venue is upscale outranks a search
       * result that thinks otherwise, and the whole point of this run is the
       * venues where nobody has decided anything.
       */
      const patch: Record<string, unknown> = {};
      if (v.cuisine == null && parsed.cuisine) patch.cuisine = parsed.cuisine;
      if (v.aesthetics == null && parsed.aesthetics) patch.aesthetics = parsed.aesthetics;
      if (!v.dress_code && parsed.dress_code) patch.dress_code = parsed.dress_code;
      if (!v.instagram_handle && parsed.instagram_handle) {
        patch.instagram_handle = parsed.instagram_handle.replace(/^@/, "");
      }
      if (!v.description?.trim() && parsed.description) {
        patch.description = parsed.description.trim().slice(0, 280);
      }
      if ((v.vibe_tags?.length ?? 0) < 3 && parsed.vibe_tags.length >= 2) {
        // Merged, not replaced: a tag somebody already put there stays.
        patch.vibe_tags = [...new Set([...(v.vibe_tags ?? []), ...parsed.vibe_tags])];
      }
      if (!v.best_for?.length && parsed.best_for.length) patch.best_for = parsed.best_for;

      const fields = Object.keys(patch);

      /*
       * A search that found little says so, and low confidence is taken at its
       * word rather than written in anyway. Half a characterisation of a venue
       * nobody could find is worse than the blank it replaces, because a blank
       * still reads as "nobody has looked".
       */
      if (parsed.confidence < 0.4 || !fields.length) {
        thin++;
        console.log(
          `  ${v.name}: little found (confidence ${parsed.confidence.toFixed(2)})${parsed.notes ? ` - ${parsed.notes}` : ""}`
        );
        continue;
      }

      filled++;
      console.log(`  ${v.name}: ${fields.join(", ")}  [${parsed.confidence.toFixed(2)}]`);

      if (!dry) {
        const { error: writeError } = await admin.from("venues").update(patch).eq("id", v.id);
        if (writeError) console.log(`     [write failed: ${writeError.message}]`);
      }
    } catch (e) {
      failed++;
      console.log(`  ${v.name}: failed, ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // Sonnet 5 rates, web-search results included in the input count.
  const cost = (inTok * 2 + outTok * 10) / 1_000_000;
  console.log(
    `\n${filled} filled, ${thin} too thin to use, ${failed} failed.` +
      `\ninput ${inTok}, output ${outTok}, about $${cost.toFixed(2)}` +
      (dry ? "\nDry run: nothing was written." : "")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
