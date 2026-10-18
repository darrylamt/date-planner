import { createClient } from "@supabase/supabase-js";
import { MOVIE_PRICE_GHS } from "./planConstants";
import type { EventRow, PlanInputs } from "./types";

/**
 * A plan's film: the evening's showings at the cinema, as events.
 *
 * Only read when someone ticks "Catch a movie". Showings are not events in
 * the ordinary sense and are never offered on their own: a hundred a week at
 * two cinemas would otherwise be the evening's "what's on" in every plan
 * near Accra Mall. Asked for, they become events like any other, and the
 * planner builds the night round one (see the anchor in planner.ts).
 *
 * cinema_showtimes (0086) is service role only, like every table since 0080,
 * so this reads it with the service key, server side. Anything wrong (no
 * table, no key, no showings) is no film rather than a failed plan.
 */

type ShowtimeRow = {
  id: string;
  venue_id: string | null;
  cinema_name: string;
  title: string;
  runtime_mins: number | null;
  genres: string[] | null;
  language: string | null;
  film_url: string | null;
  poster_url: string | null;
  show_date: string;
  show_time: string;
};

/** The genres asked for, matched loosely: "sci-fi" is "Sci-fi". */
export function genreFits(genres: string[] | null | undefined, wanted: string[] | undefined): number {
  if (!wanted?.length) return 1;
  const have = new Set((genres ?? []).map((g) => g.toLowerCase()));
  return wanted.filter((w) => have.has(w.toLowerCase())).length;
}

export async function movieEvents(inputs: PlanInputs): Promise<EventRow[]> {
  if (!inputs.movie) return [];
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return [];
  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db
      .from("cinema_showtimes")
      .select("id,venue_id,cinema_name,title,runtime_mins,genres,language,film_url,poster_url,show_date,show_time")
      .eq("show_date", inputs.date)
      .eq("is_active", true)
      .not("venue_id", "is", null)
      .limit(500);
    if (error || !data) return [];
    return (data as ShowtimeRow[])
      .filter((r) => genreFits(r.genres, inputs.movieGenres) > 0)
      .map((r) => ({
        id: `movie:${r.id}`,
        kind: "movie" as const,
        title: r.title,
        venue_id: r.venue_id,
        // Placed by its venue; an empty area is never filtered out by scope.
        area_id: "",
        event_date: r.show_date,
        start_time: r.show_time,
        cost_ghs: MOVIE_PRICE_GHS,
        category: "movie",
        source_url: r.film_url,
        description: [
          r.runtime_mins ? `${r.runtime_mins} min` : null,
          (r.genres ?? []).join(", ") || null,
          r.language,
        ]
          .filter(Boolean)
          .join(" · "),
        image_url: r.poster_url,
        booking_url: r.film_url,
        organiser_name: r.cinema_name,
        runtime_mins: r.runtime_mins,
        vibe_tags: (r.genres ?? []).map((g) => g.toLowerCase()),
        audience: "everyone" as const,
        reservation_required: false,
        is_active: true,
      }));
  } catch {
    return [];
  }
}
