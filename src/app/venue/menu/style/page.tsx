import { createClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { VenueShell } from "@/components/venue/VenueShell";
import { MenuStyleEditor } from "@/components/venue/MenuStyleEditor";
import { DEFAULT_STYLE, type MenuStyle } from "@/lib/menuStyle";
import { menuPath } from "@/lib/menuPage";

/** Menu → Menu page look: the venue's logo, cover, colours and fonts on its public menu page (0111). */
export default async function VenueMenuStylePage({ searchParams }: { searchParams: { venue?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  const db = createClient();
  const [{ data: st }, { data: row }] = await Promise.all([
    db.from("venue_menu_style").select("logo_url, cover_url, theme, accent, heading_font, body_font").eq("venue_id", venue.id).maybeSingle(),
    db.from("venues").select("name, areas(name)").eq("id", venue.id).maybeSingle(),
  ]);
  const initial: MenuStyle = { ...DEFAULT_STYLE, ...((st ?? {}) as Partial<MenuStyle>) };
  const area = (row as { areas?: { name?: string } | null } | null)?.areas?.name ?? null;
  const many = session.venues.length > 1;

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl} back={{ href: many ? `/venue/menu?venue=${venue.id}` : "/venue/menu", label: "Menu" }}>
      <div className="pl-up mb-5">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Menu page look</h1>
        <p className="mt-1 max-w-[640px] text-[15px] text-[var(--p-muted)]">
          Your menu has its own page on duroplans.com, the one your table QR stickers open and Google shows. Choose your logo, cover photo,
          colours and fonts. Add dish photos in Menu; dishes without one show a drawing.
        </p>
      </div>
      <MenuStyleEditor venueId={venue.id} venueName={venue.name} initial={initial} menuHref={menuPath(venue.id, venue.name, area)} />
    </VenueShell>
  );
}
