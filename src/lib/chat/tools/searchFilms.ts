import { z } from "zod";
import { genreFits, listShowtimes } from "../../movies";
import { MOVIE_GENRES, MOVIE_PRICE_GHS } from "../../planConstants";
import type { ChatTool } from "./types";

/**
 * What's showing at the cinema.
 *
 * Durobot could see events but not films, so "what's on at Silverbird" and
 * "a horror film on Saturday" were answered as if no cinema existed. This
 * reads the same showings the planner builds "Catch a movie" evenings round
 * (cinema_showtimes, scraped daily from Silverbird's site), grouped by film,
 * with the times on each day asked about.
 *
 * Silverbird publishes no Ghana prices, so the price is Duro!'s own estimate
 * for a ticket and snacks, and says so. A cinema not in the catalogue (West
 * Hills, for now) is listed but cannot be put in a plan, and says that too.
 */
const MAX_SPAN_DAYS = 14;
const MAX_FILMS = 12;

const argsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  genres: z.array(z.string().max(24)).max(6).optional(),
  title: z.string().max(60).optional(),
});

export type SearchFilmsArgs = z.infer<typeof argsSchema>;

export const searchFilms: ChatTool<SearchFilmsArgs> = {
  name: "search_films",
  description:
    "Films showing at Silverbird Cinemas in Accra (Accra Mall and West Hills Mall), with showtimes by day, " +
    "running time, genres and language. Use for 'what's showing', 'any horror films this weekend', " +
    "'when is Spider-Man on'. To plan an evening round a film, call build_plan with movie set to true " +
    "(and movie_genres if they named one) instead of building it yourself.",
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "First day, yyyy-mm-dd. Defaults to today." },
      to: { type: "string", description: `Last day, yyyy-mm-dd, at most ${MAX_SPAN_DAYS} days after from. Defaults to a week.` },
      genres: {
        type: "array",
        items: { type: "string" },
        description: `Only these genres, any of: ${MOVIE_GENRES.join(", ")}. Omit for every film.`,
      },
      title: { type: "string", description: "Part of a film's title, if they asked about one." },
    },
    additionalProperties: false,
  },
  parse: (raw) => argsSchema.parse(raw),

  async run(args, ctx) {
    const from = args.from && args.from > ctx.today ? args.from : ctx.today;
    let to = args.to && args.to >= from ? args.to : addDays(from, 6);
    if (to > addDays(from, MAX_SPAN_DAYS)) to = addDays(from, MAX_SPAN_DAYS);

    const now = new Date();
    const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes(); // Accra is UTC all year
    const rows = (await listShowtimes(from, to)).filter((r) => {
      if (genreFits(r.genres, args.genres) === 0) return false;
      if (args.title && !r.title.toLowerCase().includes(args.title.trim().toLowerCase())) return false;
      // Not one that has already started today.
      if (r.show_date === ctx.today) {
        const [h, m] = r.show_time.split(":").map(Number);
        if (h * 60 + m <= nowMins) return false;
      }
      return true;
    });

    if (!rows.length) {
      return {
        from,
        to,
        films: [],
        note:
          `No showings listed${args.genres?.length ? ` for ${args.genres.join(" or ")}` : ""}${args.title ? ` matching "${args.title}"` : ""} between ${from} and ${to}. ` +
          "Silverbird posts each week's times shortly before it starts, so say none are listed yet, not that nothing is showing.",
      };
    }

    // One entry per film and cinema, its times grouped by day.
    const films = new Map<string, { rows: typeof rows }>();
    for (const r of rows) {
      const key = `${r.title}|${r.cinema_name}`;
      const f = films.get(key) ?? { rows: [] };
      f.rows.push(r);
      films.set(key, f);
    }
    const list = [...films.values()].slice(0, MAX_FILMS).map(({ rows: rs }) => {
      const r = rs[0];
      const byDay = new Map<string, string[]>();
      for (const x of rs) byDay.set(x.show_date, [...(byDay.get(x.show_date) ?? []), time12(x.show_time)]);
      return {
        title: r.title,
        cinema: r.cinema_name,
        genres: r.genres,
        runs_mins: r.runtime_mins,
        language: r.language,
        showings: [...byDay.entries()].slice(0, 7).map(([d, times]) => `${dayLabel(d)}: ${times.join(", ")}`),
        // Only a cinema in the catalogue can be part of a plan.
        can_plan: Boolean(r.venue_id),
      };
    });

    return {
      from,
      to,
      films: list,
      price: `About GHS ${MOVIE_PRICE_GHS} a person for a ticket and snacks. This is Duro's estimate; Silverbird does not publish Ghana prices, so say it is an estimate.`,
      book_via: "silverbirdcinemas.com",
      ...(list.some((f) => !f.can_plan)
        ? { note: "Films with can_plan false are at a cinema Duro cannot put in a plan yet; mention them, but build plans only round the others." }
        : {}),
      ...(films.size > list.length ? { more: `${films.size} films match; these are the first ${list.length}.` } : {}),
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

/** "Sat 24 Oct": the weekday is what people plan by, and the model miscounts it. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "18:40:00" to "6:40 pm". */
function time12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
