import type { PlanInputs, Pronoun } from "./types";

/** Mirrors the web flow (src/components/plan/PlanFlow.tsx) so both clients ask the same questions. */

export const TOTAL_STEPS = 7;

export const VIBES = ["Romantic", "Calm", "Lively", "Fun", "Adventurous", "Chill"] as const;

export const START_TIMES = ["10:00", "13:00", "16:00", "17:30", "19:00"] as const;

export const DURATIONS: { label: string; hours: number }[] = [
  { label: "2h", hours: 2 },
  { label: "4h", hours: 4 },
  { label: "6h", hours: 6 },
  { label: "All evening", hours: 7 },
];

export const OCCASIONS = [
  { id: "first_date", title: "First date", sub: "Low pressure, easy exits, great talking spots" },
  { id: "anniversary", title: "Anniversary", sub: "Pull out the stops — this one matters" },
  { id: "date_night", title: "Regular date night", sub: "Keep it fresh without the fuss" },
  { id: "friend_outing", title: "Friend outing", sub: "Good food, good company, no candles" },
] as const;

export const PRONOUNS: { value: Pronoun; label: string }[] = [
  { value: "they", label: "They" },
  { value: "she", label: "She" },
  { value: "he", label: "He" },
];

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
    budget: 800,
    date: defaultDate(),
    startTime: "17:30",
    hours: 4,
    vibes: [],
    occasion: "date_night",
    partner: { name: "", pronoun: "they", food: "", place: "", interests: "", avoid: "" },
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
    adventurous: "something neither of you has tried",
    chill: "zero pressure, easy pace",
  };
  const bits = vibes.map((v) => flavour[v]).filter(Boolean).slice(0, 2);
  return `${cap(vibes.join(" + "))} — think ${bits.join(", ")}.`;
}
