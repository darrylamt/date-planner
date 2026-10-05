import { requirePlanner } from "@/lib/plannerAuth";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { PlannerHelp } from "@/components/planner/PlannerHelp";

export default async function PlannerHelpPage() {
  const session = await requirePlanner();
  return (
    <PlannerShell name={session.planner.displayName} logoUrl={session.planner.logoUrl}>
      <div className="mx-auto max-w-[680px]">
        <h1 className="pl-up text-[30px] font-bold leading-tight md:text-[36px]">Help</h1>
        <p className="pl-up mb-6 mt-1 text-[15px] text-[var(--p-muted)]">Quick answers, and a person when you need one.</p>
        <PlannerHelp who={session.planner.displayName} />
      </div>
    </PlannerShell>
  );
}
