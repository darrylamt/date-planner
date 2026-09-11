import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SmartImage } from "@/components/SmartImage";
import { createServiceClient } from "@/lib/supabase/server";
import { longDate, time12 } from "@/lib/format";
import { OCCASION_THEME, partyLabel } from "@/lib/planConstants";
import { occasionCard } from "@/lib/occasionCard";
import type { SavedPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Shared plan, public read-only view served by slug via the service role
 * (no public SELECT policy on plans).
 *
 * Wears the occasion's own accent, so a link opened by someone who was not
 * there still looks like the occasion it was made for rather than like a
 * generic export. The accent is inlined as a CSS variable because these
 * colours are per-plan and cannot be Tailwind classes known at build time.
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

  return (
    <main
      className="min-h-screen bg-lagoon text-lagoon-faint"
      style={{ ["--occasion" as string]: theme.accentDark }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col md:max-w-[1080px]">
        {/* Header */}
        <div className="px-7 pb-2 pt-10 text-center md:pt-16">
          <div className="kente mx-auto w-[72px] md:w-[88px]" />
          <div
            className="mt-5 text-caption font-bold tracking-[0.14em] md:mt-6 md:tracking-[0.16em]"
            style={{ color: "var(--occasion)" }}
          >
            {card.motif} {card.eyebrow} {card.motif}
          </div>
          <h1 className="mt-2.5 font-display text-[34px] font-bold leading-[1.2] md:mt-3 md:text-[52px] md:leading-[1.15]">
            {longDate(inputs.date)}
          </h1>
          <div className="mt-2.5 text-[15px] text-lagoon-soft md:text-[16px]">
            {itinerary.summary_route} · from {time12(inputs.startTime)}
          </div>
          {/* Addressed to whoever opened the link, which is rarely the person
              who made the plan. */}
          <p className="mx-auto mt-4 max-w-[420px] text-[15px] text-lagoon-faint md:text-[16px]">
            {card.invitation}
          </p>

          {plan.planner_note ? (
            <div
              className="mx-auto mt-6 max-w-[440px] rounded-bar px-5 py-4 text-left"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="text-caption font-bold tracking-[0.12em]"
                style={{ color: "var(--occasion)" }}
              >
                A NOTE
              </div>
              <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-lagoon-faint">
                {plan.planner_note}
              </p>
            </div>
          ) : null}
        </div>

        {/* Stops */}
        <div className="flex flex-col px-6 py-6 md:flex-row md:items-stretch md:justify-center md:gap-6 md:px-14 md:py-11">
          {itinerary.stops.map((stop, i) => (
            <div key={`${stop.venue_id}-${i}`} className="md:w-[320px]">
              <div className="card text-ink">
                <SmartImage src={stop.image_url} alt={stop.name} className="h-[130px] md:h-[170px]" />
                <div className="px-[18px] pb-[18px] pt-4">
                  <div className="stime">{stop.arrival_time}</div>
                  <div className="text-vname font-semibold">{stop.name}</div>
                  <div className="text-[14px] text-mutedbrown">
                    {stop.area}, {stop.what_to_do || stop.label.toLowerCase()}
                  </div>
                </div>
              </div>
              {i < itinerary.stops.length - 1 && (
                <div className="flex items-center gap-3 py-1.5 pl-[26px] md:hidden">
                  <div className="hopline-dark h-11 w-[2px]" />
                  <div className="text-[14px] text-lagoon-soft">
                    a short ride, ~{itinerary.hops[i]?.mins ?? 12} min
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-auto px-7 pb-10 pt-2 text-center md:pb-14">
          {/* The sign-off, which is the one line that changes most between a
              graduation and a solo day. */}
          <p className="mx-auto mb-6 max-w-[420px] text-[15px] text-lagoon-faint md:text-[16px]">
            {card.closing}
          </p>
          <div className="text-[16px] italic text-lagoon-soft md:text-[17px]">
            planned with care on
          </div>
          <div className="my-2">
            <Logo size={24} dark href={null} />
          </div>
          <Link
            href="/plan/new"
            className="btn mx-auto mt-3 w-full max-w-[260px] !bg-amber !text-lagoon hover:!bg-amber-deep"
          >
            Plan your own
          </Link>
        </div>
      </div>
    </main>
  );
}
