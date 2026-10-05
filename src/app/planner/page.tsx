import { requirePlanner } from "@/lib/plannerAuth";
import { loadNights } from "@/lib/plannerData";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { NightsList } from "@/components/planner/NightsList";
import { GettingStarted } from "@/components/planner/GettingStarted";
import { Tour } from "@/components/planner/Tour";
import { todayIso } from "@/components/planner/nights";

/**
 * Home: what is coming up, and what is left to set up.
 *
 * The welcome tour opens over it on a first visit, and again with ?tour=1.
 */
export default async function PlannerHome({ searchParams }: { searchParams: { tour?: string; saved?: string; deleted?: string } }) {
  const session = await requirePlanner();
  const nights = await loadNights(session);
  const today = todayIso();
  const upcoming = nights.filter((n) => n.event_date >= today);
  const unpriced = upcoming.filter((n) => n.cost_ghs == null).length;
  // A planner's name is usually their brand ("Recovery Saturdays"), so the greeting is the hour's, not theirs.
  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const notice = searchParams.saved ? "Saved. Your changes are live." : searchParams.deleted ? "Deleted. It is out of plans now." : null;

  return (
    <PlannerShell name={session.planner.displayName} logoUrl={session.planner.logoUrl}>
      <Tour name={session.planner.displayName} open={!session.tourDone || searchParams.tour === "1"} />

      {!session.planner.isActive ? (
        <div className="mb-5 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
          Your account is switched off, so new nights cannot go live. Get in touch with us under Help.
        </div>
      ) : null}

      <div className="pl-up mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-[var(--p-muted)]">{greeting} 👋🏾</p>
          <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Your nights</h1>
          <p className="mt-1 text-[15px] text-[var(--p-muted)]">
            {upcoming.length
              ? `${upcoming.length} coming up${unpriced ? `, ${unpriced} without a price` : ""}.`
              : "Put a night on and it can be in people's plans today."}
          </p>
        </div>
      </div>

      <GettingStarted
        hasNight={nights.length > 0}
        hasLogo={Boolean(session.planner.logoUrl)}
        hasPoster={nights.some((n) => Boolean(n.image_url))}
      />

      {unpriced ? (
        <div className="pl-up mb-5 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
          <b>{unpriced === 1 ? "One night has" : `${unpriced} nights have`} no entry price.</b> Plans with a budget leave a night out until
          it has one, even when it is free. Edit it and choose Free or type the price.
        </div>
      ) : null}

      <NightsList nights={nights} notice={notice} />
    </PlannerShell>
  );
}
