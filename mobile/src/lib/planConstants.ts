/**
 * MIRRORED from the web app: ../../src/lib/planConstants.ts
 * Edit the web copy first, then copy it here.
 */
import type { Occasion, PlanInputs } from "./types";

/**
 * The questionnaire's vocabulary. Shared by both clients and the prompt, so a
 * vibe offered on screen is always one the model has been told about.
 */

export const VIBES = [
  "Romantic",
  "Calm",
  "Lively",
  "Fun",
  "Adventurous",
  "Chill",
  "Beach",
  "Dancing",
  "Club hopping",
  "Sporty",
  "Outdoorsy",
  "Picnic",
  "Artsy",
  "Foodie",
] as const;

export const DURATIONS: { label: string; hours: number }[] = [
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "3h", hours: 3 },
  { label: "4h", hours: 4 },
  { label: "5h", hours: 5 },
  { label: "6h", hours: 6 },
  { label: "All evening", hours: 7 },
  { label: "All day", hours: 10 },
];

export const OCCASIONS: { id: Occasion; title: string; sub: string }[] = [
  { id: "first_date", title: "First date", sub: "Low pressure, easy exits, great talking spots" },
  { id: "anniversary", title: "Anniversary", sub: "Pull out the stops — this one matters" },
  { id: "date_night", title: "Date night", sub: "Keep it fresh without the fuss" },
  { id: "birthday", title: "Birthday", sub: "Make a fuss of someone" },
  { id: "graduation", title: "Graduation", sub: "Earned it — celebrate properly" },
  { id: "celebration", title: "Celebration", sub: "A promotion, a win, good news" },
  { id: "friend_outing", title: "Friends", sub: "Good food, good company, no candles" },
  { id: "solo_day", title: "Solo day", sub: "A day out on your own terms" },
];

export const OCCASION_IDS = OCCASIONS.map((o) => o.id);

/** Party presets. Anything larger is typed in. */
export const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12] as const;

export const TOTAL_STEPS = 7;

export const START_TIME_MIN_HOUR = 6;
export const START_TIME_MAX_HOUR = 23;

/** Every half hour from 06:00 to 23:30 — the wheel picker's source list. */
export function startTimeOptions(): string[] {
  const out: string[] = [];
  for (let h = START_TIME_MIN_HOUR; h <= START_TIME_MAX_HOUR; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
}

/** Next Saturday. */
export function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export function defaultInputs(): PlanInputs {
  return {
    areaIds: [],
    areaNames: [],
    surpriseMe: false,
    partySize: 2,
    companions: [],
    budget: 800,
    date: defaultDate(),
    startTime: "17:30",
    hours: 4,
    vibes: [],
    occasion: "date_night",
    occasionDetail: {},
    partner: { name: "", gender: "unspecified", food: "", place: "", interests: "", avoid: "" },
  };
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The reassurance line under the vibe picker. */
export function vibeBlurb(vibes: string[]): string {
  const flavour: Record<string, string> = {
    romantic: "warm light and room to talk",
    calm: "quiet corners",
    lively: "energy and a bit of noise",
    fun: "games and easy laughs",
    adventurous: "something nobody has tried",
    chill: "zero pressure, easy pace",
    beach: "sand, water and open air",
    dancing: "a floor worth staying on",
    "club hopping": "more than one room in one night",
    sporty: "something physical",
    outdoorsy: "green space and fresh air",
    picnic: "a blanket, a basket, somewhere to spread out",
    artsy: "something to make or look at",
    foodie: "the food is the point",
  };
  const bits = vibes.map((v) => flavour[v]).filter(Boolean).slice(0, 2);
  if (!bits.length) return "";
  return `${cap(vibes.join(" + "))} — think ${bits.join(", ")}.`;
}

/** "2 people", "just you", "6 of you". */
export function partyLabel(size: number): string {
  if (size <= 1) return "just you";
  if (size === 2) return "the two of you";
  return `all ${size} of you`;
}

/* ── occasion pathways ────────────────────────────────────────────────── */

export type StepId =
  | "occasion"
  | "party"
  | "extra"
  | "area"
  | "budget"
  | "when"
  | "vibe"
  | "details";

export interface OccasionExtra {
  /** The screen's question. */
  title: string;
  subtitle: string;
  fields: { key: string; label: string; placeholder: string; multiline?: boolean }[];
}

/**
 * The question that only makes sense for one occasion.
 *
 * This is what makes a pathway a pathway rather than a relabelled form: a
 * birthday plan that never asks whose birthday it is has nothing specific to
 * design around, and the model ends up writing something generically pleasant.
 *
 * Occasions with nothing worth asking are absent, and simply have no extra step.
 */
export const OCCASION_EXTRA: Partial<Record<Occasion, OccasionExtra>> = {
  first_date: {
    title: "How did you two meet?",
    subtitle: "A sentence is plenty. It gives us something to build a first evening around.",
    fields: [
      {
        key: "how_met",
        label: "How you met (optional)",
        placeholder: "a friend's party, matched online, work…",
      },
    ],
  },
  anniversary: {
    title: "How long has it been?",
    subtitle: "And anything the two of you always come back to.",
    fields: [
      { key: "years", label: "Years together (optional)", placeholder: "e.g. 3" },
      {
        key: "tradition",
        label: "Something you always do (optional)",
        placeholder: "the place you had your first date…",
      },
    ],
  },
  birthday: {
    title: "Whose birthday is it?",
    subtitle: "We will make sure the day is pointed at them.",
    fields: [
      { key: "celebrant", label: "Their name", placeholder: "e.g. Ama" },
      { key: "age", label: "Turning (optional)", placeholder: "e.g. 30" },
    ],
  },
  graduation: {
    title: "What did they finish?",
    subtitle: "Worth marking properly.",
    fields: [
      { key: "celebrant", label: "Who is graduating", placeholder: "e.g. Kofi, or you" },
      { key: "programme", label: "What they studied (optional)", placeholder: "e.g. Law at Legon" },
    ],
  },
  celebration: {
    title: "What are we celebrating?",
    subtitle: "The more specific, the better the evening.",
    fields: [
      {
        key: "reason",
        label: "The good news",
        placeholder: "a promotion, a new job, closing on a house…",
      },
    ],
  },
  solo_day: {
    title: "What do you need today?",
    subtitle: "A day to yourself can go a few different ways.",
    fields: [
      {
        key: "intent",
        label: "What you are after",
        placeholder: "somewhere quiet to read, try something new, treat myself…",
      },
    ],
  },
};

/**
 * The steps for one pathway, in order.
 *
 * Arriving from an occasion card means that question is already answered, so
 * asking it again is a step nobody should have to tap through.
 */
export function stepsFor(occasion: Occasion, occasionPreset: boolean): StepId[] {
  const steps: StepId[] = [];
  if (!occasionPreset) steps.push("occasion");
  steps.push("party");
  if (OCCASION_EXTRA[occasion]) steps.push("extra");
  steps.push("area", "budget", "when", "vibe", "details");
  return steps;
}
