import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { adminCounts, type AdminCounts } from "@/lib/adminCounts";
import { AdminIcon, type IconName } from "@/components/admin/AdminIcon";
import { PeriodPicker, periodFrom } from "@/components/admin/Period";

export const dynamic = "force-dynamic";

type Queue = { href: string; label: string; blurb: string; icon: IconName; n: number };

/**
 * Today: what is waiting, what is piling up, and how the week's plans went.
 *
 * The admin used to open on the venues table, so finding out whether anything
 * needed doing meant reading badges down a sidebar. This page answers it
 * first. Queues where a person is waiting on an answer come before backlogs
 * that only grow, and a queue with nothing in it is drawn quietly rather than
 * left out, so "all clear" is something you can see.
 */
export default async function AdminTodayPage({ searchParams }: { searchParams: { period?: string } }) {
  const supabase = await adminDataClient();
  const period = periodFrom(searchParams.period);
  /** A count over the chosen window (all time when there is no start). */
  const counted = (table: string, filter?: (q: any) => any) => {
    let q: any = supabase.from(table).select("*", { count: "exact", head: true });
    if (period.since) q = q.gte("created_at", period.since);
    return filter ? filter(q) : q;
  };

  const [counts, { count: madeCount }, { count: fullCount }, { count: saved }, { count: active }, { count: signals }, { count: joined }] =
    await Promise.all([
      adminCounts(),
      // Counted, not fetched: all time is hundreds of rows and growing.
      counted("plan_demand"),
      counted("plan_demand", (q) => q.eq("outcome", "ok")),
      counted("plans"),
      supabase.from("venues").select("id", { count: "exact", head: true }).eq("is_active", true),
      // Null before 0089 has run: the tile just says so.
      counted("plan_signals"),
      counted("profiles"),
    ]);

  const made = madeCount ?? 0;
  const full = fullCount ?? 0;
  const { waiting, backlog } = queues(counts);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Accra" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Accra" }).format(new Date());

  return (
    <div>
      <div className="adm-eyebrow">{today}</div>
      <h1 className="mt-1">{greeting}</h1>
      <p className="mt-1 text-[14.5px] text-mutedbrown">
        {waiting.length
          ? `${waiting.reduce((s, q) => s + q.n, 0)} things are waiting on an answer.`
          : "Nothing is waiting on an answer. Here's what's piling up and how the week went."}
      </p>

      {/* Waiting on you: somebody is on the other end of each of these. */}
      <section className="mt-7">
        <h2 className="adm-section-title">Waiting on you</h2>
        {waiting.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {waiting.map((q) => (
              <QueueTile key={q.href + q.label} q={q} tone="urgent" />
            ))}
          </div>
        ) : (
          <div className="adm-tile mt-3 flex items-center gap-3" data-tone="clear">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d8f0ed] text-[#0f766e]">
              <AdminIcon name="check" size={17} />
            </span>
            <span className="text-[14px] text-cocoa">All clear: no reports, numbers or applications waiting.</span>
          </div>
        )}
      </section>

      {/* The chosen window, in five numbers. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="adm-section-title">{period.heading}</h2>
          <PeriodPicker path="/admin" current={period.key} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Plans made" value={made} href="/admin/demand" />
          <Stat
            label="Came back full"
            value={made ? `${Math.round((full / made) * 100)}%` : "–"}
            note={made ? `${full} of ${made}` : undefined}
            href="/admin/demand"
          />
          <Stat label="Plans saved" value={saved ?? 0} />
          <Stat label="New accounts" value={joined ?? 0} />
          <Stat
            label="Signals recorded"
            value={signals ?? "–"}
            note={signals === null ? "Run migration 0089" : "Keeps, swaps, taps"}
          />
        </div>
        {period.key === "all" ? (
          <p className="mt-2 text-[12.5px] text-mutedbrown">
            Plans made are counted from 30 September 2026, when counting began; saved plans and accounts from the start.
          </p>
        ) : null}
      </section>

      {/* Backlogs: nobody is waiting, but each one makes plans worse. */}
      <section className="mt-8">
        <h2 className="adm-section-title">Catalogue backlog</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {backlog.map((q) => (
            <QueueTile key={q.href} q={q} tone={q.n > 0 ? "plain" : "clear"} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="adm-section-title">Shortcuts</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/venues/new" className="btn btnsm">
            <AdminIcon name="plus" size={15} /> Add a venue
          </Link>
          <Link href="/admin/venues" className="btn2 btnsm">
            <AdminIcon name="store" size={15} /> All {active ?? counts.venues} live venues
          </Link>
          <Link href="/admin/discover" className="btn2 btnsm">
            <AdminIcon name="compass" size={15} /> Discover venues
          </Link>
          <Link href="/admin/import" className="btn2 btnsm">
            <AdminIcon name="upload" size={15} /> Import
          </Link>
          <Link href="/admin/featured" className="btn2 btnsm">
            <AdminIcon name="star" size={15} /> Featured this week
          </Link>
        </div>
      </section>
    </div>
  );
}

function queues(c: AdminCounts): { waiting: Queue[]; backlog: Queue[] } {
  const waiting = ([
    { href: "/admin/reports", label: "Venue reports", blurb: "Someone who was there says it's wrong.", icon: "flag", n: c.openReports },
    { href: "/admin/phones", label: "Reported numbers", blurb: "A live number someone questioned.", icon: "phone", n: c.phonesReported },
    { href: "/admin/issues", label: "Problem reports", blurb: "Something wrong with Duro itself.", icon: "bug", n: c.openIssues },
    { href: "/admin/vendors", label: "Shop applications", blurb: "Cake and flower shops waiting to hear.", icon: "bag", n: c.vendorApplications },
  ] satisfies Queue[]).filter((q) => q.n > 0);
  const backlog: Queue[] = [
    { href: "/admin/phones", label: "Numbers to approve", blurb: "Can't be dialled until approved.", icon: "phone", n: c.phonesPending },
    { href: "/admin/unpriced", label: "Unpriced venues", blurb: "Left out of plans until they have a price.", icon: "tag", n: c.unpriced },
    { href: "/admin/menus", label: "Thin menus", blurb: "Under five dishes: every plan orders the same few.", icon: "list", n: c.thinMenus },
    { href: "/admin/venues?filter=no-hours", label: "No opening hours", blurb: "Could be planned on a day they're shut.", icon: "calendar", n: c.noHours },
    { href: "/admin/prices", label: "Stale menus", blurb: "Prices not touched in 90 days.", icon: "pencil", n: c.staleMenus },
    { href: "/admin/gaderin", label: "Gaderin activities", blurb: "Still needing a venue.", icon: "sparkles", n: c.gaderinWaiting },
  ];
  return { waiting, backlog };
}

function QueueTile({ q, tone }: { q: Queue; tone: "urgent" | "plain" | "clear" }) {
  return (
    <Link href={q.href} className="adm-tile group flex items-start gap-3" data-tone={tone}>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${
          tone === "urgent" ? "bg-[#fde8ef] text-[#c92c58]" : tone === "clear" ? "bg-white text-[#0f766e]" : "bg-[#f1efec] text-[#45403f]"
        }`}
      >
        <AdminIcon name={tone === "clear" ? "check" : q.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold text-ink">{q.label}</span>
          <span className={`adm-num !text-[22px] ${tone === "clear" ? "text-mutedbrown" : "text-ink"}`}>{q.n}</span>
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-mutedbrown">{tone === "clear" ? "All clear." : q.blurb}</span>
      </span>
    </Link>
  );
}

function Stat({ label, value, note, href }: { label: string; value: number | string; note?: string; href?: string }) {
  const body = (
    <>
      <div className="text-[12.5px] font-semibold text-mutedbrown">{label}</div>
      <div className="adm-num mt-1.5 text-ink">{typeof value === "number" ? value.toLocaleString("en-GB") : value}</div>
      {note ? <div className="mt-1 text-[12px] text-mutedbrown">{note}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="adm-tile block">
      {body}
    </Link>
  ) : (
    <div className="adm-tile block">{body}</div>
  );
}
