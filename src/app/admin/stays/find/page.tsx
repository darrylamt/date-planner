import { adminDataClient } from "@/lib/adminAuth";
import { StayFinder, type FinderDestination } from "@/components/admin/StayFinder";

export const dynamic = "force-dynamic";

/** The stay finder, near a Trips destination (?d= opens it on one). */
export default async function AdminFindStaysPage({ searchParams }: { searchParams: { d?: string } }) {
  const db = await adminDataClient(["stays"]);
  const { data, error } = await db.from("destinations").select("slug, name, region").eq("is_active", true).not("lat", "is", null).order("sort").order("name");
  if (error) {
    return (
      <div className="card max-w-[720px] p-5 text-[14px]">
        Run migration <b>0101_trips.sql</b> first: the finder searches near the Trips destinations.
      </div>
    );
  }
  return <StayFinder destinations={(data ?? []) as FinderDestination[]} initial={searchParams.d ?? ""} />;
}
