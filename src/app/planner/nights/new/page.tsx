import { requirePlanner } from "@/lib/plannerAuth";
import { loadAreas, loadNights, loadPlaces, usualPlaceOf } from "@/lib/plannerData";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { NightWizard } from "@/components/planner/NightWizard";

/**
 * A new night, or an old one run again (?from=<id>), which starts from
 * everything that night had except its date. ?place=<id> starts it at a
 * place, from the Places tab.
 */
export default async function NewNightPage({ searchParams }: { searchParams: { from?: string; place?: string } }) {
  const session = await requirePlanner();
  const [nights, places, areas] = await Promise.all([loadNights(session), loadPlaces(session), loadAreas()]);
  const source = searchParams.from ? nights.find((n) => n.id === searchParams.from) ?? null : null;

  return (
    <PlannerShell name={session.planner.displayName} logoUrl={session.planner.logoUrl} bare>
      <NightWizard
        mode="new"
        initial={source}
        places={places}
        areas={areas}
        organiser={{ name: session.planner.displayName, logoUrl: session.planner.logoUrl }}
        usualPlace={(searchParams.place && places.some((p) => p.id === searchParams.place) ? searchParams.place : null) ?? usualPlaceOf(nights)}
        canPublish={session.planner.isActive}
      />
    </PlannerShell>
  );
}
