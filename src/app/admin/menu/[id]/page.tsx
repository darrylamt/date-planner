import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { MenuManager, type MenuScope } from "@/components/venue/MenuManager";
import type { MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * One venue's menu, for the menus role (0095) and admins: the venue portal's
 * own editor, dishes and reading a menu photo included. It writes as the
 * signed-in login, which 0095 allows for menu_items and nothing else here.
 */
export default async function AdminMenuPage({ params }: { params: { id: string } }) {
  const supabase = await adminDataClient(["menus"]);
  const { data: v } = await supabase.from("venues").select("id, name, menu_shared_from, areas(name)").eq("id", params.id).maybeSingle();
  if (!v) notFound();
  const venue = v as unknown as { id: string; name: string; menu_shared_from: string | null; areas: { name: string } | null };
  const ownerId = venue.menu_shared_from || venue.id;

  const [{ count: sharers }, items, owner] = await Promise.all([
    supabase.from("venues").select("id", { count: "exact", head: true }).eq("menu_shared_from", ownerId),
    fetchAllRows<MenuItem>((from, to) =>
      supabase.from("menu_items").select("*").in("venue_id", [...new Set([ownerId, venue.id])]).order("id").range(from, to)
    ),
    ownerId !== venue.id ? supabase.from("venues").select("name").eq("id", ownerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const scope: MenuScope = { venueId: venue.id, venueName: venue.name, ownerId, branchCount: (sharers ?? 0) + 1 };

  return (
    <div className="max-w-[980px]">
      <Link href="/admin/menu" className="text-[13px] text-mutedbrown hover:underline">
        ← Menus
      </Link>
      <h1 className="mt-2">{venue.name}</h1>
      <p className="text-[14px] text-mutedbrown">
        {venue.areas?.name ?? ""} · {items.length} dishes
        {owner.data ? ` · shares the menu of ${(owner.data as { name: string }).name}` : ""}
      </p>
      {/* The portal's editor wears the portal's theme. */}
      <div className="planner mt-5 rounded-[18px] p-4 md:p-6">
        <MenuManager scope={scope} items={items} />
      </div>
    </div>
  );
}
