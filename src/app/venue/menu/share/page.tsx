import { createClient, createServiceClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { VenueShell } from "@/components/venue/VenueShell";
import { menuUrl } from "@/lib/menuPage";
import { QrSheet, stickerUrl } from "@/components/QrSheet";
import { PrintButton } from "@/app/admin/venues/[id]/qr/PrintButton";
import { CopyLink } from "./CopyLink";

/*
 * Menu → Share your menu (growth plan, 13 Nov 2026): the venue's menu link
 * for its Instagram bio and WhatsApp, how many times its QR stickers have
 * been scanned, and the stickers to print, without asking us.
 */
export default async function VenueMenuSharePage({ searchParams }: { searchParams: { venue?: string; size?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  const { data: row } = await createClient().from("venues").select("name, areas(name)").eq("id", venue.id).maybeSingle();
  const area = (row as { areas?: { name?: string } | null } | null)?.areas?.name ?? null;
  const link = menuUrl(venue.id, venue.name, area);
  const short = stickerUrl(venue.id);
  // Scans are counted by /q (0109); share_events is read by the server only.
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const db = createServiceClient();
  const [{ count: scans30 }, { count: scansAll }] = await Promise.all([
    db.from("share_events").select("id", { count: "exact", head: true }).eq("kind", "qr").eq("plan_slug", venue.id).gte("created_at", since),
    db.from("share_events").select("id", { count: "exact", head: true }).eq("kind", "qr").eq("plan_slug", venue.id),
  ]);
  const many = session.venues.length > 1;
  const q = (extra: string) => `/venue/menu/share?${[many ? `venue=${venue.id}` : "", extra].filter(Boolean).join("&")}`;
  const large = searchParams.size === "large";

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl} back={{ href: many ? `/venue/menu?venue=${venue.id}` : "/venue/menu", label: "Menu" }}>
      <div className="pl-up mb-5">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Share your menu</h1>
        <p className="mt-1 max-w-[680px] text-[15px] text-[var(--p-muted)]">
          Your menu and prices have their own page. Put the link in your Instagram bio and WhatsApp status, and the QR stickers on your tables. Every
          visitor can plan a night around {venue.name} in one tap.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="pl-card grid gap-3 p-5">
          <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">Your menu link</div>
          <CopyLink url={link} />
          <a href={link} target="_blank" rel="noopener" className="text-[14px] font-bold text-[var(--p-accent)]">
            Open your menu page ›
          </a>
          <div className="mt-2 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">Put it in your Instagram bio</div>
          <ol className="list-decimal pl-5 text-[15px] leading-relaxed text-[var(--p-ink-2)]">
            <li>Copy the link above.</li>
            <li>On Instagram, open your profile and tap Edit profile, then Links, then Add external link.</li>
            <li>Paste it, call it &ldquo;Menu and prices&rdquo;, and save.</li>
          </ol>
        </section>

        <section className="pl-card grid content-start gap-2 p-5">
          <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">Sticker scans</div>
          <div className="text-[44px] font-extrabold leading-none">{scans30 ?? 0}</div>
          <div className="text-[14px] text-[var(--p-muted)]">in the last 30 days · {scansAll ?? 0} in all</div>
          <div className="mt-2 break-all text-[12px] text-[var(--p-muted)]">Stickers open {short}, which counts the scan and shows your menu.</div>
        </section>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[20px] font-bold">QR stickers for your tables</div>
            <div className="text-[14px] text-[var(--p-muted)]">Print on A4 sticker paper or card, or press Print and choose Save as PDF.</div>
          </div>
          <div className="flex gap-2">
            <a href={q("")} className={`h-10 rounded-xl px-4 text-[14px] font-bold leading-[40px] ${large ? "border border-[var(--p-line)]" : "bg-[var(--p-ink)] text-white"}`}>
              12 small
            </a>
            <a href={q("size=large")} className={`h-10 rounded-xl px-4 text-[14px] font-bold leading-[40px] ${large ? "bg-[var(--p-ink)] text-white" : "border border-[var(--p-line)]"}`}>
              4 table cards
            </a>
            <PrintButton />
          </div>
        </div>
        <QrSheet venueId={venue.id} venueName={venue.name} large={large} />
      </section>
    </VenueShell>
  );
}
