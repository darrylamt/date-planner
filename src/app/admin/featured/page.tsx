import { adminDataClient } from "@/lib/adminAuth";
import { FeaturedManager, type FeaturedRow } from "@/components/admin/FeaturedManager";

export const dynamic = "force-dynamic";

export default async function AdminFeaturedPage() {
  const supabase = await adminDataClient();

  const [{ data: runs }, { data: venues }] = await Promise.all([
    supabase
      .from("featured_venues")
      .select("id, venue_id, starts_on, ends_on, headline, is_paid, sort, venues(name, areas(name))")
      .order("starts_on", { ascending: false }),
    supabase.from("venues").select("id, name, areas(name)").eq("is_active", true).order("name"),
  ]);

  const rows: FeaturedRow[] = (runs ?? []).map((r: Record<string, unknown>) => {
    const venue = r.venues as { name?: string; areas?: { name?: string } | null } | null;
    return {
      id: r.id as string,
      venue_id: r.venue_id as string,
      venue_name: venue?.name ?? "Unknown venue",
      area: venue?.areas?.name ?? "",
      starts_on: r.starts_on as string,
      ends_on: r.ends_on as string,
      headline: (r.headline as string | null) ?? null,
      is_paid: Boolean(r.is_paid),
      sort: Number(r.sort ?? 0),
    };
  });

  return (
    <FeaturedManager
      rows={rows}
      venues={(venues ?? []).map((v: Record<string, unknown>) => ({
        id: v.id as string,
        name: v.name as string,
        area: ((v.areas as { name?: string } | null)?.name ?? "") as string,
      }))}
    />
  );
}
