/**
 * The candidate names, as the Google Form has them, and how each one looks
 * when it is tried on: its colour, a mark for the icon, and a line.
 */
export interface NameOption {
  id: "Duro!" | "Outy" | "Outly" | "Hang!" | "Other";
  /** Main colour, and the second stop of its gradient. */
  color: string;
  color2: string;
  emoji: string;
  line: string;
}

export const NAME_OPTIONS: NameOption[] = [
  { id: "Duro!", color: "#E23D6D", color2: "#FF8A5B", emoji: "🔥", line: "Short, loud, and still ours." },
  { id: "Outy", color: "#22C3B5", color2: "#7CF2C8", emoji: "🎈", line: "Let's get outy." },
  { id: "Outly", color: "#E5B04E", color2: "#FFE08A", emoji: "✨", line: "Out, properly planned." },
  { id: "Hang!", color: "#8B5CF6", color2: "#E879F9", emoji: "🤙", line: "Hang out. We'll plan it." },
  { id: "Other", color: "#F472B6", color2: "#60A5FA", emoji: "💡", line: "Got a better one? Type it." },
];

export const CHOICES = NAME_OPTIONS.map((o) => o.id);

/** Voting closes at noon on 1 October, Accra time (GMT all year). Move this to extend it. */
export const POLL_CLOSES_AT = Date.parse("2026-10-01T12:00:00Z");
export const pollClosed = (now = Date.now()) => now >= POLL_CLOSES_AT;
export type Choice = NameOption["id"];

/** Case, spaces and punctuation aside: "duro", "Duro!" and " DURO " are one name. */
export const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A typed name tidied for showing: trimmed, spaces collapsed, at most 24 characters. */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 24);

/** The fixed option a typed name really is, when it is one of them ("Duro" is Duro!). */
export function fixedOptionFor(name: string): Choice | null {
  const k = nameKey(name);
  const hit = NAME_OPTIONS.find((o) => o.id !== "Other" && nameKey(o.id) === k);
  return hit ? hit.id : null;
}

/*
 * Words a suggested name may not contain. Suggestions appear to everybody
 * who opens the poll, so the obvious ones are refused outright; anything that
 * gets past this can be hidden from the admin page. Matched on the squashed
 * name, so spacing and punctuation do not get round it.
 */
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "cock", "whore", "slut", "nigg", "fag", "porn", "sex", "rape", "nazi", "hitler",
  "kwasia", "etwe", "kote", "koti", "twea", "gyimi", "aboa",
];

/** Letters, digits, spaces and a little punctuation, and nothing on the blocked list. */
export function isAllowedName(name: string): boolean {
  const n = cleanName(name);
  if (n.length < 2) return false;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} !?.'&-]*$/u.test(n)) return false;
  const k = nameKey(n);
  return !BLOCKED.some((w) => k.includes(w));
}

/* A colour pair for a suggested name, the same one every time for the same name. */
const PALETTE: [string, string][] = [
  ["#F97316", "#FACC15"],
  ["#06B6D4", "#A78BFA"],
  ["#10B981", "#A3E635"],
  ["#EC4899", "#F59E0B"],
  ["#3B82F6", "#22D3EE"],
  ["#EF4444", "#F472B6"],
  ["#8B5CF6", "#38BDF8"],
];
export function colorsFor(name: string): [string, string] {
  let h = 0;
  for (const ch of nameKey(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** What the public poll endpoint hands back. */
export interface PollResults {
  counts: Record<string, number>;
  /** Names typed under Other, with their votes, most first. Hidden ones left out. */
  suggested: { name: string; votes: number }[];
  total: number;
}
