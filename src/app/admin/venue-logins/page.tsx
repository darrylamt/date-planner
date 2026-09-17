import { adminDataClient } from "@/lib/adminAuth";
import { VenueLogins, type LoginRow } from "@/components/admin/VenueLogins";

export const dynamic = "force-dynamic";

export default async function AdminVenueLoginsPage() {
  const supabase = await adminDataClient();

  const [{ data: links }, { data: venues }] = await Promise.all([
    supabase
      .from("venue_users")
      .select("id, user_id, username, venue_id, created_at, venues(name, areas(name))")
      .order("created_at", { ascending: false }),
    supabase
      .from("venues")
      .select("id, name, areas(name)")
      .eq("is_active", true)
      .order("name"),
  ]);

  const rows: LoginRow[] = (links ?? []).map((l: Record<string, unknown>) => {
    const venue = l.venues as { name?: string; areas?: { name?: string } | null } | null;
    return {
      id: l.id as string,
      user_id: l.user_id as string,
      username: l.username as string,
      venue_id: l.venue_id as string,
      venue_name: venue?.name ?? "Unknown venue",
      area: venue?.areas?.name ?? "",
      created_at: l.created_at as string,
    };
  });

  return (
    <VenueLogins
      rows={rows}
      venues={(venues ?? []).map((v: Record<string, unknown>) => ({
        id: v.id as string,
        name: v.name as string,
        area: ((v.areas as { name?: string } | null)?.name ?? "") as string,
      }))}
    />
  );
}
