import { redirect } from "next/navigation";
import { requirePlanner } from "@/lib/plannerAuth";
import { loadAreas, loadNights, loadPlaces, usualPlaceOf } from "@/lib/plannerData";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { NightWizard } from "@/components/planner/NightWizard";

/** Changing a night they already put on. Only their own: anything else goes home. */
export default async function EditNightPage({ params }: { params: { id: string } }) {
  const session = await requirePlanner();
  const [nights, places, areas] = await Promise.all([loadNights(session), loadPlaces(session), loadAreas()]);
  const night = nights.find((n) => n.id === params.id);
  if (!night) redirect("/planner");

  return (
    <PlannerShell name={session.planner.displayName} logoUrl={session.planner.logoUrl} bare>
      <NightWizard
        mode="edit"
        initial={night}
        places={places}
        areas={areas}
        organiser={{ name: session.planner.displayName, logoUrl: session.planner.logoUrl }}
        usualPlace={usualPlaceOf(nights)}
        canPublish={session.planner.isActive}
      />
    </PlannerShell>
  );
}
