/**
 * Door to door across Accra by trotro, on foot, and by taxi where trotros do
 * not go.
 *
 * Pure: a network in, a few options out. No Supabase, no React, so the app can
 * take it unchanged once the web preview has been judged, and so it can be
 * tested against the real route map offline.
 *
 * What it will and will not claim:
 *   - A trotro leg only ever runs forward along a line, stop to stop, the way
 *     the map or an admin recorded it. Never reversed, never inferred.
 *   - Minutes are estimates and are labelled so. The map's minutes are worked
 *     out from distance, not timed, and Accra traffic can double them.
 *   - Where no stop is within a walk, the leg is a taxi, priced with the same
 *     estimator the planner uses, and said plainly: "trotros do not run here".
 */
import { estimateHop, haversineKm } from "./transport";

export interface NetStop {
  id: string;
  name: string;
  landmark: string | null;
  lat: number;
  lng: number;
}

export interface NetLine {
  id: string;
  name: string;
  headsign: string | null;
  headwayMins: number | null;
  status: "unchecked" | "confirmed";
  source: "map_2019" | "manual";
  calledAs: string | null;
  fareMin: number | null;
  fareMax: number | null;
  notes: string | null;
  checkedOn: string | null;
  /** In riding order. Minutes from the first stop, where known. */
  stops: { stopId: string; minutes: number | null }[];
}

export interface Place {
  lat: number;
  lng: number;
  label: string;
}

export type Step =
  | { kind: "walk"; toLabel: string; stopId: string | null; minutes: number; meters: number }
  | {
      kind: "ride";
      line: NetLine;
      board: NetStop;
      alight: NetStop;
      stopsBetween: number;
      minutes: number;
      waitMinutes: number;
    }
  | { kind: "taxi"; fromLabel: string; toLabel: string; minutes: number; costGhs: number; reason: string };

export interface JourneyOption {
  kind: "trotro" | "trotro+taxi" | "taxi" | "walk";
  steps: Step[];
  minutes: number;
  /** Known only when every trotro leg has a fare. Taxi is kept separate: it is an estimate of another kind. */
  trotroFareMin: number | null;
  trotroFareMax: number | null;
  taxiGhs: number;
  unchecked: boolean;
}

/** Straight-line distance a newcomer will walk to a stop. */
const WALK_KM = 1.2;
/*
 * A minute walking in Accra heat weighs more than a minute sitting down. Used
 * only to rank options, never shown: without it a trotro change was chosen
 * over a fifteen-minute walk, which nobody would do.
 */
const WALK_WEIGHT = 1.4;
/** Streets are not straight: a walk is this much longer than the crow flies. */
const DETOUR = 1.3;
const WALK_MIN_PER_KM = 13;
/** Two stops this close are one place to change at. */
const CHANGE_KM = 0.25;
/** A taxi to or from a stop is worth it up to here; past it, just take the taxi. */
const TAXI_LEG_KM = 8;
/** Changing trotros costs more than its minutes: a new station, a new queue. */
const CHANGE_PENALTY = 12;
/** Somebody will walk a short trip rather than wait for anything. */
const JUST_WALK_KM = 0.9;
const DEFAULT_HEADWAY = 15;

const walkMins = (km: number) => Math.max(1, Math.round(km * DETOUR * WALK_MIN_PER_KM));
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversineKm(a, b);

/** Everything the planner needs precomputed once per network. */
export interface Network {
  stops: Map<string, NetStop>;
  lines: NetLine[];
  /** stopId -> every (line, position) that calls there. */
  calls: Map<string, { line: number; pos: number }[]>;
  /** A coarse grid for "stops near here" without scanning four thousand. */
  grid: Map<string, string[]>;
}

const CELL = 0.01; // about 1.1 km
const cellOf = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

export function buildNetwork(stops: NetStop[], lines: NetLine[]): Network {
  const map = new Map(stops.map((s) => [s.id, s]));
  const calls = new Map<string, { line: number; pos: number }[]>();
  lines.forEach((l, li) =>
    l.stops.forEach((s, pos) => {
      const list = calls.get(s.stopId) ?? [];
      list.push({ line: li, pos });
      calls.set(s.stopId, list);
    })
  );
  const grid = new Map<string, string[]>();
  for (const s of stops) {
    const key = cellOf(s.lat, s.lng);
    const list = grid.get(key) ?? [];
    list.push(s.id);
    grid.set(key, list);
  }
  return { stops: map, lines, calls, grid };
}

/** Stops within `radius` km of a point, nearest first. */
export function stopsNear(net: Network, p: { lat: number; lng: number }, radius: number, limit = 30) {
  const reach = Math.ceil(radius / 1.1);
  const [ci, cj] = cellOf(p.lat, p.lng).split(":").map(Number);
  const out: { stop: NetStop; km: number }[] = [];
  for (let i = ci - reach; i <= ci + reach; i++) {
    for (let j = cj - reach; j <= cj + reach; j++) {
      for (const id of net.grid.get(`${i}:${j}`) ?? []) {
        const s = net.stops.get(id)!;
        if (!net.calls.has(id)) continue;
        const d = km(p, s);
        if (d <= radius) out.push({ stop: s, km: d });
      }
    }
  }
  return out.sort((a, b) => a.km - b.km).slice(0, limit);
}

export const stopLabel = (s: NetStop) => s.landmark || s.name;

function rideMinutes(line: NetLine, from: number, to: number, a: NetStop, b: NetStop): number {
  const m0 = line.stops[from].minutes;
  const m1 = line.stops[to].minutes;
  if (m0 != null && m1 != null && m1 > m0) return Math.round(m1 - m0);
  // No minutes on the line (a manual one): roughly 25 km/h through town.
  return Math.max(3, Math.round(km(a, b) * 2.4));
}

interface Access {
  stop: NetStop;
  /** How you get between the stop and the place. */
  mode: "walk" | "taxi";
  km: number;
  minutes: number;
  costGhs: number;
}

function access(net: Network, p: Place): Access[] {
  const walkable = stopsNear(net, p, WALK_KM, 25).map(({ stop, km: d }) => ({
    stop,
    mode: "walk" as const,
    km: d,
    minutes: walkMins(d),
    costGhs: 0,
  }));
  if (walkable.length) return walkable;
  // Trotros do not come here. The nearest few stops, reached by taxi.
  return stopsNear(net, p, TAXI_LEG_KM, 8).map(({ stop, km: d }) => {
    const hop = estimateHop(p, stop);
    return { stop, mode: "taxi" as const, km: d, minutes: hop.mins, costGhs: hop.cost_ghs };
  });
}

/**
 * The best few ways from one place to another.
 *
 * Always ends with the taxi-all-the-way option, because for a visitor that is
 * the honest comparison: a trotro that saves GHS 60 and costs forty minutes
 * and two changes is a choice, not an answer.
 */
export function planJourney(net: Network, from: Place, to: Place, limit = 3): JourneyOption[] {
  const direct = km(from, to);
  const taxiAll = estimateHop(from, to);
  const taxiOption: JourneyOption = {
    kind: "taxi",
    steps: [
      {
        kind: "taxi",
        fromLabel: from.label,
        toLabel: to.label,
        minutes: taxiAll.mins,
        costGhs: taxiAll.cost_ghs,
        reason: "the whole way",
      },
    ],
    minutes: taxiAll.mins,
    trotroFareMin: null,
    trotroFareMax: null,
    taxiGhs: taxiAll.cost_ghs,
    unchecked: false,
  };

  if (direct <= JUST_WALK_KM) {
    const walk: JourneyOption = {
      kind: "walk",
      steps: [{ kind: "walk", toLabel: to.label, stopId: null, minutes: walkMins(direct), meters: Math.round(direct * 1000) }],
      minutes: walkMins(direct),
      trotroFareMin: null,
      trotroFareMax: null,
      taxiGhs: 0,
      unchecked: false,
    };
    return [walk, taxiOption];
  }

  const starts = access(net, from);
  const ends = access(net, to);
  const endBy = new Map(ends.map((e) => [e.stop.id, e]));

  type Ride = { line: number; board: number; alight: number };
  type State = { score: number; rides: Ride[]; start: Access };
  type Cand = { rides: Ride[]; start: Access; end: Access; score: number };

  const rideCost = (r: Ride) => {
    const line = net.lines[r.line];
    const a = net.stops.get(line.stops[r.board].stopId)!;
    const b = net.stops.get(line.stops[r.alight].stopId)!;
    return rideMinutes(line, r.board, r.alight, a, b) + (line.headwayMins ?? DEFAULT_HEADWAY) / 2;
  };
  const accessCost = (a: Access) => (a.mode === "walk" ? a.minutes * WALK_WEIGHT : a.minutes + a.costGhs / 10);

  /*
   * Every stop reachable on one trotro, then on two, keeping the best way to
   * each. Two rounds and no more: a third trotro is a journey no newcomer
   * should be sent on, and the taxi option beside it will be the better one.
   */
  const relax = (into: Map<string, State>, stopId: string, state: State) => {
    const cur = into.get(stopId);
    if (!cur || state.score < cur.score) into.set(stopId, state);
  };

  const round1 = new Map<string, State>();
  for (const s of starts) {
    for (const call of net.calls.get(s.stop.id) ?? []) {
      const line = net.lines[call.line];
      for (let p = call.pos + 1; p < line.stops.length; p++) {
        const ride: Ride = { line: call.line, board: call.pos, alight: p };
        relax(round1, line.stops[p].stopId, { score: accessCost(s) + rideCost(ride), rides: [ride], start: s });
      }
    }
  }

  const round2 = new Map<string, State>();
  for (const [stopId, state] of round1) {
    const here = net.stops.get(stopId)!;
    const lastLine = state.rides[0].line;
    for (const { stop: t, km: gap } of stopsNear(net, here, CHANGE_KM, 6)) {
      for (const call of net.calls.get(t.id) ?? []) {
        if (call.line === lastLine) continue;
        const line = net.lines[call.line];
        for (let q = call.pos + 1; q < line.stops.length; q++) {
          const ride: Ride = { line: call.line, board: call.pos, alight: q };
          const score = state.score + walkMins(gap) * WALK_WEIGHT + CHANGE_PENALTY + rideCost(ride);
          relax(round2, line.stops[q].stopId, { score, rides: [...state.rides, ride], start: state.start });
        }
      }
    }
  }

  const cands: Cand[] = [];
  for (const reached of [round1, round2]) {
    for (const [stopId, state] of reached) {
      const e = endBy.get(stopId);
      if (e && e.mode === "walk") cands.push({ ...state, end: e, score: state.score + accessCost(e) });
    }
  }

  /*
   * The trotro gets you most of the way and a taxi does the rest.
   *
   * Only when no trotro gets within a walk of the place, and only from a stop
   * clearly nearer than the start: a taxi from somewhere no closer is just the
   * taxi option with a detour on the front.
   */
  if (!cands.length) {
    for (const reached of [round1, round2]) {
      for (const [stopId, state] of reached) {
        const stop = net.stops.get(stopId)!;
        const left = km(stop, to);
        if (left > TAXI_LEG_KM || left > direct * 0.5) continue;
        const hop = estimateHop(stop, to);
        const end: Access = { stop, mode: "taxi", km: left, minutes: hop.mins, costGhs: hop.cost_ghs };
        cands.push({ ...state, end, score: state.score + accessCost(end) });
      }
    }
  }

  /*
   * A change has to earn its place. Where one trotro gets there, a two-trotro
   * option is shown only if it is clearly quicker: a newcomer changing
   * vehicles at a roadside to save four minutes is a newcomer who misses the
   * second one.
   */
  const bestDirect = Math.min(...cands.filter((c) => c.rides.length === 1).map((c) => c.score));
  const worthIt = cands.filter((c) => c.rides.length === 1 || c.score < bestDirect - 10);
  cands.length = 0;
  cands.push(...worthIt);

  // One per sequence of lines: the same two trotros boarded a stop apart is one answer.
  cands.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const picked: Cand[] = [];
  for (const c of cands) {
    const key = c.rides.map((r) => net.lines[r.line].name).join(">") + `|${c.end.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(c);
    if (picked.length >= limit) break;
  }

  const options = picked.map((c) => toOption(net, c, from, to));
  return [...options, taxiOption];
}

function toOption(
  net: Network,
  c: { rides: { line: number; board: number; alight: number }[]; start: Access; end: Access },
  from: Place,
  to: Place
): JourneyOption {
  const steps: Step[] = [];
  let taxi = 0;
  let minutes = 0;

  const first = net.stops.get(net.lines[c.rides[0].line].stops[c.rides[0].board].stopId)!;
  if (c.start.mode === "walk") {
    steps.push({ kind: "walk", toLabel: stopLabel(first), stopId: first.id, minutes: c.start.minutes, meters: Math.round(c.start.km * 1000) });
  } else {
    steps.push({
      kind: "taxi",
      fromLabel: from.label,
      toLabel: stopLabel(first),
      minutes: c.start.minutes,
      costGhs: c.start.costGhs,
      reason: "trotros do not run near the start",
    });
    taxi += c.start.costGhs;
  }
  minutes += c.start.minutes;

  c.rides.forEach((r, i) => {
    const line = net.lines[r.line];
    const board = net.stops.get(line.stops[r.board].stopId)!;
    const alight = net.stops.get(line.stops[r.alight].stopId)!;
    if (i > 0) {
      const prev = net.lines[c.rides[i - 1].line];
      const came = net.stops.get(prev.stops[c.rides[i - 1].alight].stopId)!;
      if (came.id !== board.id) {
        const gap = km(came, board);
        steps.push({ kind: "walk", toLabel: stopLabel(board), stopId: board.id, minutes: walkMins(gap), meters: Math.round(gap * 1000) });
        minutes += walkMins(gap);
      }
    }
    const ride = rideMinutes(line, r.board, r.alight, board, alight);
    const wait = Math.round((line.headwayMins ?? DEFAULT_HEADWAY) / 2);
    steps.push({ kind: "ride", line, board, alight, stopsBetween: r.alight - r.board - 1, minutes: ride, waitMinutes: wait });
    minutes += ride + wait;
  });

  if (c.end.mode === "walk") {
    steps.push({ kind: "walk", toLabel: to.label, stopId: null, minutes: c.end.minutes, meters: Math.round(c.end.km * 1000) });
  } else {
    steps.push({
      kind: "taxi",
      fromLabel: stopLabel(c.end.stop),
      toLabel: to.label,
      minutes: c.end.minutes,
      costGhs: c.end.costGhs,
      reason: "trotros do not go the last stretch",
    });
    taxi += c.end.costGhs;
  }
  minutes += c.end.minutes;

  const lines = c.rides.map((r) => net.lines[r.line]);
  const allFares = lines.every((l) => l.fareMin != null || l.fareMax != null);
  return {
    kind: taxi > 0 ? "trotro+taxi" : "trotro",
    steps,
    minutes: Math.round(minutes),
    trotroFareMin: allFares ? lines.reduce((t, l) => t + Number(l.fareMin ?? l.fareMax), 0) : null,
    trotroFareMax: allFares ? lines.reduce((t, l) => t + Number(l.fareMax ?? l.fareMin), 0) : null,
    taxiGhs: taxi,
    unchecked: lines.some((l) => l.status !== "confirmed"),
  };
}
