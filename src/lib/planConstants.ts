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
