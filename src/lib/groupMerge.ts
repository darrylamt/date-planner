import { planInputsSchema } from "./schemas";
import { VIBES } from "./planConstants";
import { DEFAULT_CITY } from "./planConstants";
import { haversineKm } from "./transport";
import {
  SLOTS,
  SLOT_START,
  datesInRange,
  hardNoFromTag,
  type Availability,
  type GroupOccasion,
  type HardNo,
  type Slot,
} from "./groups";
import type { PlanInputs } from "./types";

/**
 * Everyone's answers, turned into one set of plan inputs.
 *
 * Server-side only. Budgets are not here at all: they are applied per person
 * by groupPlan.ts, so nothing about merging can leak one.
 */

export interface MergeMember {
  id: string;
  name: string;
  isOrganiser: boolean;
  answered: boolean;
  availability: Availability;
  vibes: string[];
  hardNos: HardNo[];
  tags: string[];
  fromAreaId: string | null;
}

export interface MergeGroup {
  occasion: GroupOccasion;
  dateFrom: string;
  dateTo: string;
  /** Chosen days (0084); absent means every day of the range. */
  days?: string[];
  areaHintId: string | null;
}

export interface AreaRow {
  id: string;
  name: string;
  city: string | null;
  /** The area's centre, from its venues (areaCentroids.ts). Null when none is located. */
  lat?: number | null;
  lng?: number | null;
  /** Whether a plan can be built there at all (coverage.ts liveAreas). */
  plannable?: boolean;
}

/**
 * The meeting area that is fairest to everyone: the plannable area whose
 * longest journey, from where any one person is coming, is shortest. Two
 * friends in Dansoman and one in East Legon meet in between, not in Dansoman;
 * if everyone is coming from one place, it is that place. Ties go to the
 * shorter journeys overall. Null when nobody said where they are coming from.
 */
export function fairestArea(attending: MergeMember[], areas: AreaRow[]): AreaRow | null {
  const byId = new Map(areas.map((a) => [a.id, a]));
  const points = attending
    .map((m) => (m.fromAreaId ? byId.get(m.fromAreaId) : undefined))
    .filter((a): a is AreaRow => Boolean(a && a.lat != null && a.lng != null));
  if (!points.length) return null;
  // Stay in the city most people are coming from: Kumasi friends are not sent to Accra.
  const cityCount = new Map<string, number>();
  for (const p of points) cityCount.set(p.city ?? "", (cityCount.get(p.city ?? "") ?? 0) + 1);
  const city = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const candidates = areas.filter((a) => a.plannable && a.lat != null && a.lng != null && (a.city ?? "") === city);
  let best: AreaRow | null = null;
  let bestWorst = Infinity;
  let bestSum = Infinity;
  for (const a of candidates) {
    const d = points.map((p) => haversineKm({ lat: a.lat!, lng: a.lng! }, { lat: p.lat!, lng: p.lng! }));
    const worst = Math.max(...d);
    const sum = d.reduce((s, x) => s + x, 0);
    if (worst < bestWorst - 0.05 || (Math.abs(worst - bestWorst) <= 0.05 && sum < bestSum)) {
      best = a;
      bestWorst = worst;
      bestSum = sum;
    }
  }
  return best;
}

/** Hard no's for one person: what they ticked plus what their typed words match. */
export function hardNosOf(m: Pick<MergeMember, "hardNos" | "tags">): Set<HardNo> {
  const out = new Set<HardNo>(m.hardNos);
  for (const t of m.tags) {
    const id = hardNoFromTag(t);
    if (id) out.add(id);
  }
  return out;
}

/**
 * The date and slot most people can make.
 *
 * Ties go to the evening (most outings are), then to slots the organiser can
 * make, then to the earliest date. Two people at least, or there is nothing to
 * plan. The organiser may name a date and slot themselves.
 */
export function pickSlot(
  group: MergeGroup,
  members: MergeMember[],
  override?: { date?: string; slot?: Slot }
): { date: string; slot: Slot; attending: MergeMember[] } | null {
  const answered = members.filter((m) => m.answered);
  const dates = group.days?.length ? group.days : datesInRange(group.dateFrom, group.dateTo);
  const candidates: { date: string; slot: Slot; attending: MergeMember[] }[] = [];
  for (const date of dates) {
    if (override?.date && override.date !== date) continue;
    for (const slot of SLOTS) {
      if (override?.slot && override.slot !== slot) continue;
      const attending = answered.filter((m) => (m.availability[date] ?? []).includes(slot));
      candidates.push({ date, slot, attending });
    }
  }
  candidates.sort(
    (a, b) =>
      b.attending.length - a.attending.length ||
      Number(b.slot === "evening") - Number(a.slot === "evening") ||
      Number(b.attending.some((m) => m.isOrganiser)) - Number(a.attending.some((m) => m.isOrganiser)) ||
      a.date.localeCompare(b.date)
  );
  const best = candidates[0];
  return best && best.attending.length >= 2 ? best : null;
}

/** The three vibes most asked for, minus any a hard no rules out. */
export function mergeVibes(attending: MergeMember[]): string[] {
  const known = new Set<string>(VIBES);
  const counts = new Map<string, number>();
  for (const m of attending) for (const v of m.vibes) if (known.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const anyNo = (id: HardNo) => attending.some((m) => hardNosOf(m).has(id));
  const blocked = new Set<string>(["Romantic"]);
  if (anyNo("no_clubs") || anyNo("no_loud_music")) {
    blocked.add("Club hopping");
    blocked.add("Dancing");
  }
  const order = VIBES as readonly string[];
  const top = [...counts.entries()]
    .filter(([v]) => !blocked.has(v))
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .slice(0, 3)
    .map(([v]) => v);
  return top.length ? top : ["Fun"];
}

/** Plan inputs for the chosen slot. budget is a placeholder: groupPlan sizes money per person. */
export function mergeInputs(
  group: MergeGroup,
  members: MergeMember[],
  areas: AreaRow[],
  opts: { date?: string; slot?: Slot; ai?: boolean } = {}
):
  | { status: "ok"; inputs: PlanInputs; date: string; slot: Slot; attending: MergeMember[] }
  | { status: "not_enough" } {
  const picked = pickSlot(group, members, opts);
  if (!picked) return { status: "not_enough" };
  const { date, slot, attending } = picked;

  const byId = new Map(areas.map((a) => [a.id, a]));
  // The organiser's own pick wins; otherwise the fairest place to meet.
  const area =
    group.areaHintId && byId.has(group.areaHintId) ? byId.get(group.areaHintId)! : fairestArea(attending, areas);

  const nos = new Set<HardNo>();
  for (const m of attending) for (const id of hardNosOf(m)) nos.add(id);
  const everyoneDry = attending.every((m) => hardNosOf(m).has("no_alcohol"));

  const raw = {
    areaIds: area ? [area.id] : [],
    areaNames: area ? [area.name] : [],
    surpriseMe: !area,
    city: area?.city ?? DEFAULT_CITY,
    partySize: attending.length,
    // Names stay with the plan row and the bill; never sent to the copy writer.
    companions: attending.map((m) => m.name),
    budget: 0,
    driving: false,
    date,
    startTime: SLOT_START[slot],
    hours: 4,
    vibes: mergeVibes(attending),
    occasion: group.occasion,
    crew: "mixed",
    alcohol: everyoneDry ? "none" : "either",
    ...(nos.has("no_long_drives") ? { radiusKm: 0 } : {}),
    ai: opts.ai ?? false,
    partner: { avoid: nos.has("no_crowds") ? "crowds" : "" },
  };
  return { status: "ok", inputs: planInputsSchema.parse(raw) as PlanInputs, date, slot, attending };
}
