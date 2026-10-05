import { requirePlanner } from "@/lib/plannerAuth";
import { loadAreas } from "@/lib/plannerData";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { PlacesManager } from "@/components/planner/PlacesManager";

/** Places the planner added because they were not on Duro yet. */
export default async function PlannerPlacesPage({ searchParams }: { searchParams: { add?: string } }) {
  const session = await requirePlanner();
  const areas = await loadAreas();

  return (
    <PlannerShell name={session.planner.displayName} logoUrl={session.planner.logoUrl}>
      <div className="pl-up mb-6">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Places</h1>
        <p className="mt-1 text-[15px] text-[var(--p-muted)]">Places you added to Duro for your nights.</p>
      </div>
      <PlacesManager
        places={session.ownPlaces.map((p) => ({ ...p, mine: true }))}
        areas={areas}
        startOpen={searchParams.add === "1"}
      />
    </PlannerShell>
  );
}
