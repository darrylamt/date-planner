import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { MenuStyleEditor } from "@/components/venue/MenuStyleEditor";
import { DEFAULT_STYLE, type MenuStyle } from "@/lib/menuStyle";
import { menuPath } from "@/lib/menuPage";

export const dynamic = "force-dynamic";

/** The admin's way into a venue's menu page look (0111), the same editor the venue has. */
export default async function AdminVenueStylePage({ params }: { params: { id: string } }) {
  const db = await adminDataClient();
  const [{ data: v }, { data: st }] = await Promise.all([
    db.from("venues").select("id, name, areas(name)").eq("id", params.id).maybeSingle(),
    db.from("venue_menu_style").select("logo_url, cover_url, theme, accent, heading_font, body_font").eq("venue_id", params.id).maybeSingle(),
  ]);
  const venue = v as unknown as { id: string; name: string; areas: { name: string } | null } | null;
  if (!venue) notFound();
  const initial: MenuStyle = { ...DEFAULT_STYLE, ...((st ?? {}) as Partial<MenuStyle>) };

  return (
    <div className="planner max-w-[1100px] rounded-2xl bg-[var(--p-bg)] p-5 text-[var(--p-ink)]">
      <Link href={`/admin/venues/${venue.id}`} className="text-[13px] font-semibold text-flame">
        ← {venue.name}
      </Link>
      <h1 className="mt-1">Menu page look</h1>
      <p className="mb-5 mt-1 text-[14px] text-mutedbrown">The venue can change this themselves in their portal, under Menu.</p>
      <MenuStyleEditor venueId={venue.id} venueName={venue.name} initial={initial} menuHref={menuPath(venue.id, venue.name, venue.areas?.name)} />
    </div>
  );
}
