import { z } from "zod";
import { fetchAllRows } from "../../fetchAll";
import { describeSchedule } from "../../schedules";
import { weekdayOf } from "../../hours";
import type { EventRow, VenueSchedule } from "../../types";
import type { ChatTool } from "./types";
import { keywordHits, keywordPatterns } from "./shared";

/**
 * What's on.
 *
 * Durobot could see a venue's weekly nights one venue at a time, through
 * get_venue, and could not see dated events at all. With nearly four hundred
 * on the calendar, "what's happening this weekend" and "anything for
 * Halloween" were answered "we have nothing recorded", which was false and
 * sounded like an empty app. This reads the same events the planner builds
 * evenings around, and the weekly nights beside them.
 *
 * Grouped by title and venue, because the calendar repeats itself: bowling
 * is listed every day, and fourteen rows of it would crowd out the one
 * Halloween party somebody actually asked about. One-off nights come first,
 * the things that run most days last.
 */
const LIMIT = 12;
const MAX_LIMIT = 20;
/** Long enough for "this month" or "Halloween" asked a few weeks out. */
const MAX_SPAN_DAYS = 31;
/** How far ahead repeats are counted, to tell a one-off from a daily activity. */
const REPEAT_HORIZON_DAYS = 60;
/** Words that would match half the calendar and narrow nothing. */
const STOP = new Set(["night", "nights", "event", "events", "thing", "things", "something", "the", "and", "for", "with", "show", "day", "days", "this", "weekend", "tonight", "today", "accra"]);
/** How listings name the same thing. "Trick or Trivia" is a Halloween night that never says so. */
const ALSO: Record<string, string[]> = {
  halloween: ["trick or", "spook", "costume", "horror", "haunt"],
  music: ["band", "jazz", "afrobeat", "dj", "gig"],
  kids: ["kid", "children", "family"],
  children: ["kid", "family"],
  family: ["kid", "children"],
  party: ["rave", "dj", "dance"],
};

const argsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // No minimum: a model asking for "everything on" sends an empty string, and refusing it lost the answer.
  query: z.string().max(60).optional(),
  areas: z.array(z.string()).max(6).optional(),
  max_cost_ghs: z.number().nonnegative().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

export type SearchEventsArgs = z.infer<typeof argsSchema>;

type Row = Pick<
  EventRow,
  | "id"
  | "title"
  | "venue_id"
  | "area_id"
  | "event_date"
  | "start_time"
  | "cost_ghs"
  | "category"
  | "description"
  | "audience"
  | "vibe_tags"
  | "booking_url"
  | "organiser_name"
  | "is_active"
>;
type Place = { id: string; name: string; area_id: string | null };

export const searchEvents: ChatTool<SearchEventsArgs> = {
  name: "search_events",
  description:
    "What's on between two dates: dated events (gigs, parties, classes, workshops, runs, Halloween nights) " +
    "and venues' weekly nights (karaoke, trivia, live bands). Use it for 'what's happening this weekend', " +
    "'anything on tonight', 'where can I do karaoke', 'Halloween events'. Only events somebody has listed " +
    "with Duro are here: an empty result means none recorded, not that nothing is on.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "First day, yyyy-mm-dd. Defaults to today." },
      to: {
        type: "string",
        description: `Last day, yyyy-mm-dd, at most ${MAX_SPAN_DAYS} days after from. Defaults to a week. "This weekend" is Friday to Sunday; "tonight" is from and to both today.`,
      },
      query: {
        type: "string",
        description: "One or two words for the kind of thing, e.g. halloween, karaoke, jazz, padel, painting, run. Omit for everything on.",
      },
      areas: {
        type: "array",
        items: { type: "string" },
        description: "Neighbourhood names, e.g. Osu, Labone. Omit for all of Accra.",
      },
      max_cost_ghs: { type: "number", description: "Most a ticket may cost per person, in cedis." },
      limit: { type: "integer", description: `How many to return, up to ${MAX_LIMIT}. Defaults to ${LIMIT}.` },
    },
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx) {
    const from = args.from && args.from > ctx.today ? args.from : ctx.today;
    let to = args.to && args.to >= from ? args.to : addDays(from, 6);
    if (to > addDays(from, MAX_SPAN_DAYS)) to = addDays(from, MAX_SPAN_DAYS);

    const [rows, fixtures, areas] = await Promise.all([
      fetchAllRows<Row>((a, b) =>
        ctx.catalog
          .from("events")
          .select("id,title,venue_id,area_id,event_date,start_time,cost_ghs,category,description,audience,vibe_tags,booking_url,organiser_name,is_active")
          .eq("is_active", true)
          .gte("event_date", ctx.today)
          .lte("event_date", addDays(ctx.today, REPEAT_HORIZON_DAYS))
          .order("event_date")
          .range(a, b)
      ),
      ctx.catalog.from("venue_schedules").select("*").eq("is_active", true),
      ctx.catalog.from("areas").select("id,name,city"),
    ]);

    const areaById = new Map(((areas.data ?? []) as { id: string; name: string; city: string | null }[]).map((a) => [a.id, a]));
    const weekly = (fixtures.data ?? []) as VenueSchedule[];

    // Names for the venues involved. Anon reads see only live venues, so a
    // fixture at a venue that is off is dropped, as the venue itself would be.
    const ids = [...new Set([...rows.map((r) => r.venue_id), ...weekly.map((f) => f.venue_id)].filter(Boolean))] as string[];
    const { data: venueRows } = ids.length
      ? await ctx.catalog.from("venues").select("id,name,area_id").eq("is_active", true).in("id", ids)
      : { data: [] };
    const venues = new Map(((venueRows ?? []) as Place[]).map((v) => [v.id, v]));

    const words = keywordPatterns(args.query, STOP, ALSO);
    const hits = (...text: (string | null | undefined)[]) =>
      words.length ? keywordHits(words, text.filter(Boolean).join(" ")) : 1;
    const wantedAreas = (args.areas ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean);
    const inArea = (areaId: string | null | undefined) => {
      if (!wantedAreas.length) return true;
      const name = (areaId && areaById.get(areaId)?.name.toLowerCase()) || "";
      return !!name && wantedAreas.some((w) => name === w || name.includes(w) || w.includes(name));
    };

    // How often each thing recurs, across the whole horizon, not just the dates asked.
    const keyOf = (r: Row) => `${r.title.trim().toLowerCase()}|${r.venue_id ?? ""}`;
    const repeats = new Map<string, number>();
    for (const r of rows) repeats.set(keyOf(r), (repeats.get(keyOf(r)) ?? 0) + 1);

    const groups = new Map<string, { rows: Row[]; score: number }>();
    for (const r of rows) {
      if (r.event_date < from || r.event_date > to) continue;
      if (args.max_cost_ghs != null && Number(r.cost_ghs ?? 0) > args.max_cost_ghs) continue;
      const venue = r.venue_id ? venues.get(r.venue_id) : undefined;
      if (!inArea(r.area_id ?? venue?.area_id)) continue;
      const score = hits(r.title, r.description, r.category, r.organiser_name, venue?.name, ...(r.vibe_tags ?? []));
      if (!score) continue;
      const g = groups.get(keyOf(r)) ?? { rows: [], score };
      g.rows.push(r);
      groups.set(keyOf(r), g);
    }

    const rank = (n: number) => (n <= 1 ? 0 : n < 7 ? 1 : 2);
    const listed = [...groups.entries()]
      .sort(
        ([ka, a], [kb, b]) =>
          b.score - a.score ||
          rank(repeats.get(ka) ?? 1) - rank(repeats.get(kb) ?? 1) ||
          a.rows[0].event_date.localeCompare(b.rows[0].event_date) ||
          String(a.rows[0].start_time).localeCompare(String(b.rows[0].start_time))
      )
      .slice(0, Math.min(MAX_LIMIT, args.limit ?? LIMIT))
      .map(([key, g]) => {
        const r = g.rows[0];
        const venue = r.venue_id ? venues.get(r.venue_id) : undefined;
        const n = repeats.get(key) ?? 1;
        const dates = g.rows.map((x) => dayLabel(x.event_date));
        const who = r.audience === "women" ? "ladies only" : r.audience === "men" ? "men only" : undefined;
        return {
          title: r.title,
          venue: venue?.name ?? r.organiser_name ?? null,
          venue_id: venue?.id ?? null,
          area: (r.area_id && areaById.get(r.area_id)?.name) || null,
          dates: dates.length > 4 ? [...dates.slice(0, 4), `and ${dates.length - 4} more`] : dates,
          starts: r.start_time ? r.start_time.slice(0, 5) : null,
          price:
            r.cost_ghs == null ? "not recorded" : Number(r.cost_ghs) === 0 ? "free entry, per the listing" : `GHS ${Math.round(Number(r.cost_ghs))} per person`,
          runs: n <= 1 ? "one date only" : n < 7 ? "on set days" : "most days",
          ...(who ? { who } : {}),
          about: r.description ? r.description.replace(/\s+/g, " ").trim().slice(0, 140) : null,
          book_via: r.booking_url ? hostOf(r.booking_url) : null,
        };
      });

    // Weekly nights that fall on one of the days asked.
    const days = new Set<number>();
    for (let d = from; d <= to && days.size < 7; d = addDays(d, 1)) {
      const w = weekdayOf(d);
      if (w != null) days.add(w);
    }
    const nights = weekly
      .filter((f) => days.has(f.weekday) && venues.has(f.venue_id))
      .filter((f) => inArea(venues.get(f.venue_id)!.area_id))
      .filter((f) => hits(f.title, f.notes, venues.get(f.venue_id)!.name) > 0)
      .map((f) => ({
        venue: venues.get(f.venue_id)!.name,
        venue_id: f.venue_id,
        area: areaById.get(venues.get(f.venue_id)!.area_id ?? "")?.name ?? null,
        night: describeSchedule(f),
      }));

    const total = groups.size;
    if (!listed.length && !nights.length) {
      return {
        from,
        to,
        events: [],
        weekly_nights: [],
        note:
          `Nothing listed ${args.query ? `matching "${args.query}" ` : ""}between ${from} and ${to}. ` +
          "That means nobody has told Duro about one, not that nothing is on in Accra; say it that way.",
      };
    }
    return {
      from,
      to,
      events: listed,
      weekly_nights: nights,
      ...(total > listed.length
        ? { note: `${total} events match; these are the first ${listed.length}, one-off nights before things that run most days.` }
        : {}),
    };
  },
};

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 30 Oct": the weekday is what people plan by, and the model miscounts it. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
