import { createClient } from "@/lib/supabase/server";
import { PlanFlow } from "@/components/plan/PlanFlow";
import type { Area } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  const supabase = createClient();
  const { data } = await supabase.from("areas").select("*").order("name");
  const areas = (data ?? []) as Area[];

  return <PlanFlow areas={areas} />;
}
