import { z } from "zod";
import guide from "../guide.json";
import { fold } from "../../fold";
import type { ChatTool } from "./types";

/**
 * Being in Ghana: safety by time of day, getting around, entry, health, law,
 * money, emergencies, costs, December (owner, 13 Nov 2026: "ask it anything
 * about being in Ghana").
 *
 * Answers only from guide.json, sourced facts read from government advice
 * and official sites (scripts/build-guide.ts). Every fact carries its
 * source and date, so the reply can say whose advice it is. The owner's
 * unchecked drafts are not in it.
 */

type Fact = (typeof guide.facts)[number] & { place?: string; time?: string; unconfirmed?: boolean };
const FACTS = guide.facts as Fact[];
const TOPICS = [...new Set(FACTS.map((f) => f.topic))].sort();

const argsSchema = z.object({
  question: z.string().min(2).max(300),
  topic: z.string().max(40).optional(),
  at_night: z.boolean().optional(),
});
export type GhanaGuideArgs = z.infer<typeof argsSchema>;

/** Words that carry no meaning for matching. */
const STOP = new Set("the a an and or of to in on at for is are be it i we my our me you your what whats how where which can do does is there any about with from this that tonight today safe safety ghana go going".split(" "));
const words = (s: string) => fold(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

export const ghanaGuide: ChatTool<GhanaGuideArgs> = {
  name: "ghana_guide",
  description:
    "Facts about being in Ghana, each from a named source with its date: safety and crime by place and time of day, getting around (taxis, ride apps, tro-tros, travel between towns), visas and entry, health, laws, money, phones, emergencies (numbers, hospitals, embassies), what things typically cost, seasons, and the December season. " +
    "Use it for any question about how to stay safe, what is allowed, what to bring, who to call, or how things work in Ghana. Say only what it returns, and name the source.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "What they asked, in their words." },
      topic: { type: "string", description: `Narrows the search to one of: ${TOPICS.join(", ")}.` },
      at_night: { type: "boolean", description: "True when the question is about the evening or late at night." },
    },
    required: ["question"],
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args) {
    const want = words(args.question);
    const scored = FACTS.filter((f) => !args.topic || f.topic === args.topic)
      .map((f) => {
        const hay = new Set(words(`${f.title} ${f.fact} ${f.place ?? ""} ${f.topic}`));
        let score = want.filter((w) => hay.has(w) || [...hay].some((h) => h.length >= 5 && (h.startsWith(w) || w.startsWith(h)))).length;
        if (args.at_night && f.time === "night") score += 2;
        if (args.topic) score += 1;
        return { f, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (!scored.length) {
      return {
        facts: [],
        topics: TOPICS,
        note: "The guide has nothing on that. Say so plainly; do not answer from general knowledge. Offer a topic the guide covers if one is close.",
      };
    }
    return {
      facts: scored.map(({ f }) => ({
        topic: f.topic,
        title: f.title,
        fact: f.fact,
        ...(f.place ? { place: f.place } : {}),
        source: f.sources.map((s) => `${s.name} (${s.dated})`).join("; "),
        ...(f.unconfirmed ? { unconfirmed: "Sources disagree or a detail is unread: say it is to be confirmed." } : {}),
      })),
      read_on: guide.read_on,
    };
  },
};
