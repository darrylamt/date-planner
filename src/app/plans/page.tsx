import Link from "next/link";
import { redirect } from "next/navigation";
import { BackArrow } from "@/components/BackArrow";
import { createClient } from "@/lib/supabase/server";
import { SmartImage } from "@/components/SmartImage";
import { ghs, shortDate } from "@/lib/format";
import type { SavedPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

const OCCASION_LABEL: Record<string, string> = {
  first_date: "First date",
  anniversary: "Anniversary",
  date_night: "Date night",
  friend_outing: "Friend outing",
};

/** Saved plans list, Upcoming / Past sections as designed. */
export default async function PlansPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/plans");

  const { data } = await supabase
    .from("plans")
    .select("*")
    .order("created_at", { ascending: false });

  const plans = (data ?? []) as SavedPlan[];
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = plans.filter((p) => p.inputs.date >= todayIso);
  const past = plans.filter((p) => p.inputs.date < todayIso);

  const Card = ({ plan, faded }: { plan: SavedPlan; faded?: boolean }) => (
    <Link
      href={`/p/${plan.share_slug}`}
      className={`card block px-[18px] py-4 transition-shadow hover:shadow-phone ${faded ? "opacity-85" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[16px] font-bold">
            {shortDate(plan.inputs.date)} · {plan.itinerary.stops[0]?.arrival_time}
          </div>
          <div className="text-[14px] text-mutedbrown">
            {OCCASION_LABEL[plan.inputs.occasion] ?? "Date"} · {plan.itinerary.stops.length} stops ·{" "}
            {plan.itinerary.summary_route}
          </div>
        </div>
        <div className="whitespace-nowrap font-mono font-bold text-amber">
          {ghs(plan.estimated_total_ghs)}
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        {plan.itinerary.stops.slice(0, 4).map((s, i) => (
          <SmartImage
            key={`${s.venue_id}-${i}`}
            src={s.image_url}
            alt={s.name}
            className="h-16 w-16 rounded-icon"
            overlay={false}
            sizes="64px"
          />
        ))}
      </div>
    </Link>
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col">
      <div className="flex items-center justify-between px-6 pt-[22px]">
        <Link href="/" className="backbtn" aria-label="Home">
          <BackArrow />
        </Link>
        <div className="font-display text-[20px] font-bold">Your plans</div>
        <div className="w-10" />
      </div>

      <div className="mt-6 flex flex-col gap-3 px-6">
        {plans.length === 0 && (
          <div className="card px-5 py-8 text-center">
            <div className="kente mx-auto w-16" />
            <div className="mt-4 text-[16px] font-bold">No plans yet</div>
            <div className="mt-1 text-[14px] text-mutedbrown">
              Plan your first date and it&apos;ll live here.
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <>
            <div className="text-caption font-bold uppercase tracking-[0.08em] text-mutedbrown">
              Upcoming
            </div>
            {upcoming.map((p) => (
              <Card key={p.id} plan={p} />
            ))}
          </>
        )}

        {past.length > 0 && (
          <>
            <div className="mt-3.5 text-caption font-bold uppercase tracking-[0.08em] text-mutedbrown">
              Past
            </div>
            {past.map((p) => (
              <Card key={p.id} plan={p} faded />
            ))}
          </>
        )}
      </div>

      <div className="mt-auto px-6 pb-7 pt-5">
        <Link href="/plan/new" className="btn">
          Plan a new date
        </Link>
      </div>
    </main>
  );
}
