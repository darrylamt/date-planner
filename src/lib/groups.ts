import type { Itinerary, ItineraryOrder, StopCharge } from "./types";

/**
 * Group outings: the vocabulary both clients and the server share.
 *
 * Mirrored into the app (scripts/mirror-shared.ts), so nothing here may
 * import from outside src/lib or touch the server. The rules that decide a
 * plan live server-side in groupMerge.ts and groupPlan.ts; this is only the
 * shape of what is asked and what comes back.
 */

/** Most people in one group. A bill link holds twelve names, and so does this. */
export const GROUP_MAX = 12;

/** Groups a free account may have going at once. Pro has no limit. */
export const FREE_ACTIVE_GROUPS = 2;

/** Longest range of dates a group can be asked about: two weeks. */
export const GROUP_MAX_DAYS = 14;

export const GROUP_OCCASIONS = ["friend_outing", "birthday", "celebration", "graduation"] as const;
export type GroupOccasion = (typeof GROUP_OCCASIONS)[number];

export const SLOTS = ["day", "evening"] as const;
export type Slot = (typeof SLOTS)[number];

/** When a plan starts for each slot. */
export const SLOT_START: Record<Slot, string> = { day: "13:00", evening: "19:00" };

export const SLOT_LABEL: Record<Slot, string> = { day: "Daytime", evening: "Evening" };

/**
 * Things somebody refuses outright.
 *
 * "venue" removes places; "dish" changes only that person's own order;
 * "soft" leans away without refusing; "drive" keeps the evening close.
 */
export const HARD_NOS = [
  { id: "no_clubs", label: "No clubs", kind: "venue" },
  { id: "no_loud_music", label: "No loud music", kind: "venue" },
  { id: "no_smoke", label: "No shisha or smoke", kind: "venue" },
  { id: "no_long_walks", label: "No long walks", kind: "venue" },
  { id: "no_long_drives", label: "No long drives", kind: "drive" },
  { id: "no_crowds", label: "Not too crowded", kind: "soft" },
  { id: "no_seafood", label: "No seafood", kind: "dish" },
  { id: "no_pork", label: "No pork", kind: "dish" },
  { id: "no_alcohol", label: "No alcohol", kind: "dish" },
] as const;
export type HardNo = (typeof HARD_NOS)[number]["id"];
export const HARD_NO_IDS = HARD_NOS.map((h) => h.id) as HardNo[];

/**
 * A typed hard no, matched to one we can act on. Anything unmatched is kept
 * as a tag the organiser sees, counted and unnamed, and changes nothing else.
 */
export function hardNoFromTag(tag: string): HardNo | null {
  const t = tag.toLowerCase();
  if (/sea ?food|fish|prawn|shrimp|crab|lobster|oyster|calamari/.test(t)) return "no_seafood";
  if (/pork|bacon|ham\b/.test(t)) return "no_pork";
  if (/alcohol|drink|booze|beer|wine|sober/.test(t)) return "no_alcohol";
  if (/club|rave/.test(t)) return "no_clubs";
  if (/loud|noise|dj/.test(t)) return "no_loud_music";
  if (/smok|shisha|hookah|cigar/.test(t)) return "no_smoke";
  if (/crowd|busy/.test(t)) return "no_crowds";
  if (/walk|hike/.test(t)) return "no_long_walks";
  if (/drive|far|traffic|distance/.test(t)) return "no_long_drives";
  return null;
}

/** Every date from `from` to `to` inclusive, as yyyy-mm-dd. */
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`).getTime();
  for (let t = new Date(`${from}T12:00:00Z`).getTime(); t <= end && out.length <= GROUP_MAX_DAYS; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** date -> the slots they can do that date. */
export type Availability = Record<string, Slot[]>;

/** What one person answers. Budget is theirs alone and never shown to anyone else. */
export interface GroupAnswer {
  name: string;
  availability: Availability;
  budget: number;
  vibes: string[];
  hardNos: HardNo[];
  tags: string[];
  fromAreaId: string | null;
}

export type GroupStatus = "collecting" | "ready" | "planned" | "locked" | "cancelled";

/** What anyone holding the link may see. No budgets, no orders, ever. */
export interface GroupPublic {
  code: string;
  occasion: GroupOccasion;
  title: string | null;
  organiser: string;
  dateFrom: string;
  dateTo: string;
  deadline: string;
  area: string | null;
  status: GroupStatus;
  answered: string[];
  count: number;
  max: number;
  locked: null | {
    slug: string;
    date: string;
    startTime: string;
    title: string;
    stops: { name: string; area: string; arrival_time: string; label: string }[];
  };
}

/** One stop of a person's own order. */
export interface PersonalStopOrder {
  stopIndex: number;
  venue_id: string;
  venue_name: string;
  orders: ItineraryOrder[];
  charges: StopCharge[];
  /** Their equal share of what everyone pays here: entry, a court, a ticket. */
  shared_ghs: number;
  /** Their own order with what the venue adds to it. */
  personal_ghs: number;
}

/** A person's whole evening, as only they see it. */
export interface MemberOrder {
  stops: PersonalStopOrder[];
  shared_ghs: number;
  personal_ghs: number;
  rides_ghs: number;
  total_ghs: number;
}

/** GET /api/groups/[code]/me */
export interface GroupMe {
  memberId: string;
  isOrganiser: boolean;
  answer: GroupAnswer | null;
  attending: boolean | null;
  order: (MemberOrder & { budget_ghs: number }) | null;
}

/** GET /api/groups/[code]/organiser: counts, never budgets or orders. */
export interface GroupOrganiserView extends GroupPublic {
  members: { id: string; name: string; answered: boolean; isOrganiser: boolean }[];
  tally: { date: string; slot: Slot; count: number; names: string[] }[];
  vibes: { vibe: string; count: number }[];
  hardNos: { id: HardNo; count: number }[];
  tags: string[];
  areas: { name: string; count: number }[];
  proposal: null | {
    planId: string;
    date: string;
    slot: Slot;
    itinerary: Itinerary;
    attending: string[];
    away: string[];
    stale: boolean;
  };
}

/** A row of "your groups". */
export interface GroupSummary {
  code: string;
  title: string | null;
  occasion: GroupOccasion;
  status: GroupStatus;
  role: "organiser" | "member";
  dateFrom: string;
  dateTo: string;
  planDate: string | null;
}
