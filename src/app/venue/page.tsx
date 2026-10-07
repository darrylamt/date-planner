import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { fetchAllRows } from "@/lib/fetchAll";
import { CHECKLIST_VENUE_COLUMNS, checklistScore, venueChecklist } from "@/lib/venueChecklist";
import { VenueShell } from "@/components/venue/VenueShell";
import { VenueTour } from "@/components/venue/VenueTour";
import { ShowToggle } from "@/components/venue/ShowToggle";
import { Bookings } from "@/components/venue/Bookings";
import { Ring } from "@/components/venue/ui";
import { IconChevron, IconClock, IconFork, IconImage, IconMusic } from "@/components/planner/icons";
import type { ReservationRequest } from "@/lib/types";

/**
 * Home: are you showing, who wants a table, and the next thing to do.
 *
 * Bookings first because they are why a manager opens this on a day nothing
 * about the listing has changed. The checklist second, and only its top
 * three, because a home screen that greets you with ten jobs is one you close.
 */
export default async function VenueHome({ searchParams }: { searchParams: { venue?: string; tour?: string } }) {
  const { session, venue, imageUrl, isActive, tourDone } = await venuePortal(searchParams.venue);
  const supabase = createClient();
  const q = session.venues.length > 1 ? `?venue=${venue.id}` : "";
  const link = (href: string) => {
    const [path, hash] = href.split("#");
    return `${path}${q}${hash ? `#${hash}` : ""}`;
  };

  const [{ data: bookings }, { data: row }, { data: insights }] = await Promise.all([
    supabase.from("reservation_requests").select("*").eq("venue_id", venue.id).order("reservation_date", { ascending: false }).limit(60),
    supabase.from("venues").select(CHECKLIST_VENUE_COLUMNS).eq("id", venue.id).maybeSingle(),
    supabase.rpc("venue_insights", { p_venue: venue.id, p_days: 30 }),
  ]);
  const v = row as Record<string, unknown> | null;
  const owner = (v?.menu_shared_from as string | null) || venue.id;
  const menu = await fetchAllRows<{ notes: string | null; image_url: string | null }>((a, b) =>
    supabase.from("menu_items").select("notes, image_url").in("venue_id", [...new Set([owner, venue.id])]).range(a, b)
  ).catch(() => []);

  const checks = venueChecklist(v, menu);
  const score = checklistScore(checks);
  const next = checks.filter((c) => !c.ok).sort((a, b) => b.weight - a.weight).slice(0, 3);
  const stats = insights as { in_plans?: number; saved?: number; table_requests?: number } | null;
  const rows = (bookings ?? []) as ReservationRequest[];
  const today = new Date().toISOString().slice(0, 10);
  const waiting = rows.filter((b) => (b.status === "requested" || b.status === "sent") && b.reservation_date >= today).length;

  const hour = new Date().getUTCHours();
  const greeting = hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";

  const actions = [
    { href: "/venue/menu", label: "Change a price", sub: `${menu.length} on your menu`, icon: IconFork },
    { href: "/venue/hours", label: "Opening hours", sub: "Closed on a holiday?", icon: IconClock },
    { href: "/venue/whats-on", label: "Add a night", sub: "Live band, karaoke…", icon: IconMusic },
    { href: "/venue/listing#photos", label: "Photos", sub: "Make them want to come", icon: IconImage },
  ];

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl}>
      <VenueTour name={venue.name} open={!tourDone || searchParams.tour === "1"} menuHref={link("/venue/menu")} />

      <div className="pl-up mb-5">
        <p className="text-[15px] font-semibold text-[var(--p-muted)]">{greeting} 👋🏾</p>
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">{venue.name}</h1>
      </div>

      <ShowToggle venueId={venue.id} active={isActive} />

      {/* ── Bookings ── */}
      <section className="mt-7">
        <div className="pl-up mb-3 flex items-baseline justify-between" style={{ animationDelay: "100ms" }}>
          <h2 className="text-[21px] font-bold">
            Bookings
            {waiting ? <span className="ml-2 rounded-full bg-[var(--p-accent)] px-2.5 py-0.5 align-middle text-[13px] text-white">{waiting} new</span> : null}
          </h2>
        </div>
        <Bookings rows={rows} />
      </section>

      {/* ── Setup ── */}
      {next.length ? (
        <section className="pl-card pl-up mt-7 p-5 md:p-6" style={{ animationDelay: "160ms" }}>
          <div className="flex items-center gap-4">
            <Ring value={score} />
            <div className="min-w-0">
              <h2 className="text-[19px] font-bold leading-tight">Your listing is {score}% ready</h2>
              <p className="mt-1 text-[14px] leading-snug text-[var(--p-muted)]">
                The more complete it is, the more plans you appear in. Here&apos;s what would help most:
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {next.map((c, n) => (
              <Link
                key={c.label}
                href={link(c.href)}
                className="pl-up pl-lift group flex items-center gap-3 rounded-2xl bg-[var(--p-sunken)] px-4 py-3.5"
                style={{ animationDelay: `${260 + n * 80}ms` }}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[13px] font-bold text-[var(--p-accent)] ring-2 ring-[var(--p-accent-soft)]">
                  {n + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-bold">{c.label}</span>
                  <span className="block text-[13px] leading-snug text-[var(--p-muted)]">{c.why}</span>
                </span>
                <IconChevron className="shrink-0 text-[var(--p-muted)] transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="pl-card pl-up mt-7 flex items-center gap-4 p-5" style={{ animationDelay: "160ms" }}>
          <Ring value={100} size={64} stroke={7} />
          <div>
            <h2 className="text-[18px] font-bold">Your listing is complete 🎉</h2>
            <p className="text-[14px] text-[var(--p-muted)]">Keep your menu and hours current and you&apos;ll keep showing up.</p>
          </div>
        </section>
      )}

      {/* ── Last 30 days ── */}
      {stats ? (
        <section className="mt-7">
          <div className="pl-up mb-3 flex items-baseline justify-between" style={{ animationDelay: "200ms" }}>
            <h2 className="text-[21px] font-bold">Last 30 days</h2>
            <Link href={link("/venue/insights")} className="text-[14px] font-bold text-[var(--p-accent)]">
              More insights →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: stats.in_plans ?? 0, label: "times in a plan" },
              { n: stats.saved ?? 0, label: "plans saved" },
              { n: stats.table_requests ?? 0, label: "table requests" },
            ].map((s, i) => (
              <div key={s.label} className="pl-card pl-up px-3 py-4 text-center" style={{ animationDelay: `${240 + i * 70}ms` }}>
                <div className="pl-pop text-[28px] font-bold tabular-nums leading-none" style={{ animationDelay: `${380 + i * 70}ms` }}>
                  {s.n.toLocaleString()}
                </div>
                <div className="mt-1.5 text-[12.5px] font-semibold leading-tight text-[var(--p-muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Quick jobs ── */}
      <section className="mt-7">
        <h2 className="pl-up mb-3 text-[21px] font-bold" style={{ animationDelay: "260ms" }}>
          Quick jobs
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {actions.map((a, i) => (
            <Link key={a.label} href={link(a.href)} className="pl-card pl-up pl-lift flex flex-col gap-3 p-4" style={{ animationDelay: `${300 + i * 60}ms` }}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--p-accent-soft)] text-[var(--p-accent)]">
                <a.icon size={22} />
              </span>
              <span>
                <span className="block text-[15.5px] font-bold leading-tight">{a.label}</span>
                <span className="block text-[13px] text-[var(--p-muted)]">{a.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </VenueShell>
  );
}
