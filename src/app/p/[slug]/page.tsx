import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SmartImage } from "@/components/SmartImage";
import { createServiceClient } from "@/lib/supabase/server";
import { longDate, time12 } from "@/lib/format";
import type { SavedPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Shared plan — public read-only view served by slug via the service role
 * (no public SELECT policy on plans). Dark "AN EVENING FOR TWO" layout,
 * mobile stacked / desktop three-across as designed.
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

  return (
    <main className="min-h-screen bg-lagoon text-lagoon-faint">
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col md:max-w-[1080px]">
        {/* Header */}
        <div className="px-7 pb-2 pt-10 text-center md:pt-16">
          <div className="kente mx-auto w-[72px] md:w-[88px]" />
          <div className="mt-5 text-caption font-bold tracking-[0.14em] text-lagoon-soft md:mt-6 md:tracking-[0.16em]">
            AN EVENING FOR TWO
          </div>
          <h1 className="mt-2.5 font-display text-[34px] font-bold leading-[1.2] md:mt-3 md:text-[52px] md:leading-[1.15]">
            {longDate(inputs.date)}
          </h1>
          <div className="mt-2.5 text-[15px] text-lagoon-soft md:text-[16px]">
            {itinerary.summary_route} · from {time12(inputs.startTime)}
          </div>
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
                    {stop.area} — {stop.what_to_do || stop.label.toLowerCase()}
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
