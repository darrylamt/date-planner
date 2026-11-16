import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedPlan, type SharedStop } from "@/components/shared/SharedPlan";
import { createFreshServiceClient as createServiceClient } from "@/lib/supabase/server";
import { instagramUrl, longDate, time12 } from "@/lib/format";
import { AUDIENCE_BADGE, OCCASION_GLYPHS, OCCASION_THEME } from "@/lib/planConstants";
import { occasionCard, occasionColors, occasionEntrance } from "@/lib/occasionCard";
import type { ItineraryStop, SavedPlan } from "@/lib/types";
import { isHalloween } from "@/components/Logo";
import { isPro } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

/**
 * What the link looks like before anyone opens it.
 *
 * A shared plan is almost always pasted into a chat, so the preview is the
 * first thing the person sees and, if they do not tap, the only thing. It was
 * showing the site's generic title and description, which made a plan built
 * for one person look like an advert for the product.
 *
 * The occasion's own words, and nothing invented: the eyebrow, the date and
 * the route all come off the saved plan. Not indexed, because these links are
 * private in the sense that matters, unlisted and sent to one person, and a
 * search result naming someone's anniversary is not a feature.
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("share_slug", params.slug)
    .maybeSingle();

  const plan = data as (Pick<SavedPlan, "inputs" | "itinerary"> & { surprise?: boolean }) | null;
  if (!plan) return { title: "Duro!", robots: { index: false, follow: false } };

  const card = occasionCard(plan.inputs);
  const stops = plan.itinerary.stops?.length ?? 0;
  const title = `${card.eyebrow}, ${longDate(plan.inputs.date)}`;
  // Surprise mode: the preview names the first stop only, like the page.
  const route = plan.surprise ? `${plan.itinerary.stops?.[0]?.name ?? "A night out"}, then a surprise` : plan.itinerary.summary_route;
  const description = `${route}. ${stops} stop${stops === 1 ? "" : "s"}, from ${time12(plan.inputs.startTime)}.`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Duro!",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * A picture for a stop that has none: what sort of place it is, as one emoji.
 * The label and the venue's type first; the description only as a last
 * resort, since "bubble teas" in a noodle bar's line is not a café.
 */
const BY_WORD: [RegExp, string][] = [
  [/golf/, "⛳"],
  [/bowl/, "🎳"],
  [/arcade|game|machine|kart|laser|racing track/, "🕹️"],
  [/music|karaoke|dj/, "🎶"],
  [/pool|swim/, "🏊"],
  [/massage|spa|pedi|mani/, "💆"],
  [/waffle|crepe|dessert|ice cream|cake|pastr/, "🍰"],
  [/coffee|boba|café|cafe/, "☕"],
  [/cocktail|drink|nightcap|sip|wine|beer/, "🍸"],
  [/walk|garden|park|beach/, "🌿"],
];
const BY_TYPE: Record<string, string> = {
  restaurant: "🍽️",
  activity: "🎯",
  lounge: "🍸",
  outdoor: "🌿",
  cafe: "☕",
  dessert: "🍰",
  wellness: "💆",
};
function stopEmoji(stop: ItineraryStop): string {
  if (stop.kind === "event") return "🎟️";
  const match = (text: string) => BY_WORD.find(([re]) => re.test(text.toLowerCase()))?.[1];
  return match(stop.label ?? "") ?? BY_TYPE[stop.venue_type ?? ""] ?? match(stop.what_to_do ?? "") ?? "🍽️";
}

/**
 * Shared plan, public read-only view served by slug via the service role
 * (no public SELECT policy on plans). The page itself lives in SharedPlan;
 * this reads the plan and hands it over as plain words and numbers.
 */
export default async function SharedPlanPage({ params }: { params: { slug: string } }) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("share_slug", params.slug)
    .maybeSingle();

  if (!data) notFound();
  const plan = data as SavedPlan;
  const { itinerary, inputs } = plan;

  const theme = OCCASION_THEME[inputs.occasion] ?? OCCASION_THEME.date_night;
  const card = occasionCard(inputs);
  const date = longDate(inputs.date);
  const gap = date.indexOf(" ");
  const stops = itinerary.stops ?? [];
  const hops = stops.slice(1).map((_, i) => itinerary.hops?.[i]?.mins ?? 12);

  // Accra keeps GMT all year, so the plan's own clock is UTC.
  const startsAt = Date.parse(`${inputs.date}T${inputs.startTime}:00Z`);
  const length = stops.reduce((t, st) => t + (st.duration_mins ?? 0), 0) + hops.reduce((t, m) => t + m, 0);

  /*
   * "Are you in?" (0107): offered until the day after the plan, and only once
   * the table is there, so this page can ship before its migration.
   */
  const upcoming = !Number.isNaN(startsAt) && startsAt + 2 * 86_400_000 > Date.now();
  const rsvp = upcoming && !(await supabase.from("plan_responses").select("id", { count: "exact", head: true }).limit(1)).error;

  const visible: SharedStop[] = stops.map((st, i) => ({
    key: `${st.venue_id}-${i}`,
    name: st.name,
    area: st.area,
    time: st.arrival_time,
    // "Ladies only" rides on the label, so nobody forwards it to a friend it excludes.
    label: [st.label, st.event?.audience ? AUDIENCE_BADGE[st.event.audience] : null].filter(Boolean).join(" · "),
    what: st.what_to_do || "",
    // Without the cover: the guest's copy carries no money anywhere.
    whatsOn: (st.whats_on ?? []).map((line) => line.replace(/, GHS [\d,.]+ in/, "")),
    // Who is running the night, as the app's stop card shows it (0071).
    host: st.event?.organiser_name ? { name: st.event.organiser_name, logo: st.event.organiser_logo_url ?? null } : null,
    /*
     * What they will eat and do there, by name and never by price. The door
     * line is left out: without its figure it says nothing.
     */
    dishes: st.orders.filter((o) => !o.door && o.qty > 0).map((o) => ({ item: o.item, qty: o.qty })),
    // The first picture only, which is the event's poster where there is one.
    image: st.images?.[0] ?? st.image_url ?? null,
    instagram: instagramUrl(st.instagram_handle),
    emoji: stopEmoji(st),
  }));

  /*
   * Surprise mode (0112, Pro): each stop after the first stays hidden until
   * it is time to leave for it, which is when the stop before it ends. The
   * hidden stop is replaced here, on the server, so its name is never sent.
   */
  // A Pro feature, checked here too: the column is the owner's to write, Pro or not.
  const surprise =
    Boolean((plan as SavedPlan & { surprise?: boolean }).surprise) && !Number.isNaN(startsAt) && Boolean(plan.user_id) &&
    isPro(((await supabase.from("entitlements").select("tier,status,expires_at").eq("user_id", plan.user_id!).maybeSingle()).data ?? { tier: "free", status: "none", expires_at: null }) as never);
  let clock = Number.isNaN(startsAt) ? 0 : startsAt;
  const shared: SharedStop[] = visible.map((st, i) => {
    if (i > 0) clock += (stops[i - 1].duration_mins ?? 0) * 60_000;
    const revealAt = clock;
    if (i > 0) clock += (hops[i - 1] ?? 12) * 60_000;
    if (!surprise || i === 0 || Date.now() >= revealAt) return st;
    return {
      key: `hidden-${i}`,
      name: "A surprise",
      area: "",
      time: st.time,
      label: `Revealed at ${time12(new Date(revealAt).toISOString().slice(11, 16))}`,
      what: "",
      whatsOn: [],
      host: null,
      dishes: [],
      image: null,
      instagram: null,
      emoji: "🎁",
      hidden: true,
      revealAt,
    };
  });

  return (
    <SharedPlan
      eyebrow={card.eyebrow}
      motif={card.motif}
      invitation={card.invitation}
      closing={card.closing}
      weekday={gap > 0 ? date.slice(0, gap) : date}
      dayMonth={gap > 0 ? date.slice(gap + 1) : ""}
      route={
        surprise
          ? shared.map((st, i) => (st.hidden ? "?" : stops[i].area || st.name))
          : itinerary.summary_route.split(/\s*→\s*/).filter(Boolean)
      }
      from={time12(inputs.startTime)}
      startsAt={Number.isNaN(startsAt) ? null : startsAt}
      endsAt={Number.isNaN(startsAt) ? null : startsAt + Math.max(length, 60) * 60_000}
      note={plan.planner_note?.trim() || null}
      stops={shared}
      hops={hops}
      colors={occasionColors(inputs.occasion)}
      page={theme.pageDark}
      glyphs={OCCASION_GLYPHS[inputs.occasion] ?? OCCASION_GLYPHS.date_night}
      entrance={occasionEntrance(inputs.occasion)}
      slug={params.slug}
      halloween={isHalloween()}
      rsvp={rsvp}
    />
  );
}
