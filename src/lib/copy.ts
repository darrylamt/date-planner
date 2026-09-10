import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, parseModelJson, textFromResponse } from "./anthropic";
import { clockFromMinutes, type PlannedItinerary } from "./planner";
import { ghs, longDate } from "./format";
import { aboutName, pronounForGender, pronounSet } from "./pronouns";
import type { PlanInputs } from "./types";

/**
 * Writing, not planning.
 *
 * The venues, the orders and every number are already decided by the time this
 * runs, so the model is asked only for the words. That keeps the prompt to the
 * two or three stops actually chosen instead of the whole candidate catalogue,
 * and removes the retry loop that used to fire whenever the model's arithmetic
 * missed the budget.
 *
 * Because nothing here can change a price or a venue, a bad answer costs a
 * clumsy sentence rather than a wrong plan.
 */
const MODEL = "claude-sonnet-5";

/** Fixed on every request. See the cache note at the call site. */
const SYSTEM = `You write short, warm copy for aduro, a date and outing planner in Accra.

The itinerary is already fixed: venues, orders, prices and times are decided and you cannot change them. Write only the words.

Rules:
- Never mention a venue, dish or price that is not in the data given to you.
- Each stop carries a generic fallback label. Beat it: name what this particular place is or what they actually do there ("GAMES & MUSIC", "GRILLS", "ROOFTOP DRINKS") rather than repeating the generic one. The only hard rule is that the label must not contradict the venue's type — a grill house is never "DRINKS", a bar is never "DINNER".
- Never state or imply a total, a saving, or that something is cheap or expensive. The budget is shown to the user separately and your guess would contradict it.
- Warm and specific, never salesy. No exclamation marks, no "nestled", no "hidden gem".
- Use the personal details you are given. A line that would fit any couple in any city has failed.
- British spelling.

Return ONLY this JSON:
{
  "title": string,              // 3-6 words naming the evening, e.g. "Jollof, vinyl and a rooftop"
  "personal_summary": string,   // <= 12 words: the details you designed around, separated by ·
  "budget_note": string|null,   // only if asked for below; otherwise null
  "stops": [                    // exactly one entry per stop, in order
    {
      "label": string,          // 1-3 words, upper case, e.g. "DINNER", "LIVE MUSIC"
      "what_to_do": string,     // one sentence, what they actually do here
      "why_this_fits": string   // one sentence tying it to the person's details
    }
  ]
}`;

export const copySchema = z.object({
  title: z.string(),
  personal_summary: z.string().default(""),
  budget_note: z.string().nullable().default(null),
  stops: z.array(
    z.object({
      label: z.string(),
      what_to_do: z.string().default(""),
      why_this_fits: z.string().default(""),
    })
  ),
});

export type PlanCopy = z.infer<typeof copySchema>;

function peopleLine(inputs: PlanInputs): string {
  if (inputs.partySize <= 1) return "One person, on their own. Never imply company.";
  if (inputs.partySize > 2) {
    const named = inputs.companions.filter(Boolean);
    return `A group of ${inputs.partySize}${named.length ? ` — ${named.join(", ")}` : ""}. No couple-ish language.`;
  }
  const pronoun = pronounForGender(inputs.partner.gender);
  const ps = pronounSet(pronoun);
  const who = aboutName(inputs.partner.name, pronoun);
  return `Two people. Refer to the other as "${who}", pronoun ${ps.they}/${ps.them}.`;
}

function detailLines(inputs: PlanInputs): string {
  const p = inputs.partner;
  const extras = Object.entries(inputs.occasionDetail ?? {})
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v.trim()}`);

  return [
    p.food ? `- Food they love: ${p.food}` : "",
    p.place ? `- Their kind of place: ${p.place}` : "",
    p.interests ? `- Into: ${p.interests}` : "",
    p.avoid ? `- Avoids: ${p.avoid}` : "",
    ...extras,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUserMessage(inputs: PlanInputs, plan: PlannedItinerary): string {
  const stops = plan.stops
    .map((s, i) => {
      const orders = s.orders.length
        ? s.orders.map((o) => `${o.item} ×${o.qty}`).join(", ")
        : "no order";
      return [
        `${i + 1}. ${s.venue.name} — ${s.venue.type} in ${s.venue.areas?.name ?? ""}`,
        `   arriving ${clockFromMinutes(s.arrivalMinutes)}, ${s.durationMins} min`,
        `   generic fallback label (improve on it): ${s.label}`,
        `   ordering: ${orders}`,
        s.venue.description ? `   about: ${s.venue.description}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const trimmedNote = plan.trimmed
    ? `\nThis plan was trimmed to fit the budget. Write budget_note as one honest sentence saying what was kept simple — do not apologise and do not mention amounts.`
    : `\nWrite budget_note as null.`;

  return `OCCASION: ${inputs.occasion.replace(/_/g, " ")} on ${longDate(inputs.date)}
${peopleLine(inputs)}
VIBE: ${inputs.vibes.join(", ") || "not specified"}

WHO IT IS FOR:
${detailLines(inputs) || "- nothing given"}

THE ITINERARY (fixed — write copy for exactly these ${plan.stops.length} stops, in order):
${stops}
${trimmedNote}`;
}

export interface CopyResult {
  ok: true;
  copy: PlanCopy;
}
export interface CopyFailure {
  ok: false;
  error: string;
}

export async function writePlanCopy(
  inputs: PlanInputs,
  plan: PlannedItinerary
): Promise<CopyResult | CopyFailure> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      /*
       * Room for both the thinking and the answer. This model thinks by
       * default, and at 1500 the thinking consumed the entire budget: the
       * response came back with no text at all and every plan silently fell
       * back to placeholder copy.
       */
      max_tokens: 4000,
      // Writing six short sentences from a fixed brief needs no deliberation.
      output_config: { effort: "low" },
      system: [
        {
          type: "text",
          text: SYSTEM,
          /*
           * Identical on every request, but measured at 583 tokens — below
           * Sonnet's 1024-token cache minimum, so the API ignores this today
           * and nothing is actually cached. Kept because it costs nothing and
           * starts paying the moment these rules grow past the floor; do not
           * read it as evidence that caching is already saving money here.
           */
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserMessage(inputs, plan) }],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "The model declined to write this plan." };
    }
    if (response.stop_reason === "max_tokens") {
      // Named explicitly: truncation and a refusal both surface as missing
      // JSON, and they need opposite fixes.
      return { ok: false, error: "The copy was cut off before it finished." };
    }

    const parsed = copySchema.parse(parseModelJson<PlanCopy>(textFromResponse(response)));
    if (parsed.stops.length !== plan.stops.length) {
      return { ok: false, error: "Copy did not match the itinerary." };
    }
    return { ok: true, copy: parsed };
  } catch (e) {
    console.error("copy generation failed", e);
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Rate limited — try again shortly." };
    }
    return { ok: false, error: "Could not reach the writing service." };
  }
}

/**
 * Copy for a plan whose words could not be written.
 *
 * The itinerary is already valid — real venues, real prices, correct totals —
 * so failing the whole request over prose would throw away a working plan.
 */
export function fallbackCopy(inputs: PlanInputs, plan: PlannedItinerary): PlanCopy {
  return {
    title: `An evening in ${plan.stops[0]?.venue.areas?.name ?? "Accra"}`,
    personal_summary: inputs.vibes.join(" · "),
    budget_note: plan.trimmed
      ? `Kept simple to stay inside ${ghs(inputs.budget)}.`
      : null,
    stops: plan.stops.map((s) => ({
      label: s.label,
      what_to_do: "",
      why_this_fits: "",
    })),
  };
}
