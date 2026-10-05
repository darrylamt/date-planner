import { requirePlanner } from "@/lib/plannerAuth";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { ProfileCard } from "@/components/planner/ProfileCard";

export default async function PlannerProfilePage() {
  const session = await requirePlanner();
  const p = session.planner;

  return (
    <PlannerShell name={p.displayName} logoUrl={p.logoUrl}>
      <div className="mx-auto max-w-[640px]">
        <h1 className="pl-up mb-6 text-[30px] font-bold leading-tight md:text-[36px]">Profile</h1>
        <ProfileCard name={p.displayName} username={p.username} phone={p.contactPhone} logoUrl={p.logoUrl} />
      </div>
    </PlannerShell>
  );
}
