import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { venuePortal } from "@/lib/venuePortal";
import { fetchAllRows } from "@/lib/fetchAll";
import { CHECKLIST_VENUE_COLUMNS, checklistScore, venueChecklist } from "@/lib/venueChecklist";
import { VenueShell } from "@/components/venue/VenueShell";
import { Ring } from "@/components/venue/ui";
import { IconCheck, IconChevron } from "@/components/planner/icons";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OCCASION: Record<string, string> = {
  first_date: "First dates",
  anniversary: "Anniversaries",
  date_night: "Date nights",
  birthday: "Birthdays",
  graduation: "Graduations",
  celebration: "Celebrations",
  friend_outing: "Friends out",
  solo_day: "Solo days",
  business_meeting: "Business meetings",
  family_day: "Family days",
};

interface Insights {
  in_plans: number;
  by_occasion: Record<string, number>;
  by_weekday: Record<string, number>;
  saved: number;
  table_requests: number;
  area_plans: number;
  area_unmet: number;
  area_occasions: Record<string, number>;
  area_budgets: Record<string, number>;
}

const top = (o: Record<string, number> | null | undefined, n = 5) =>
  Object.entries(o ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

/**
 * What Duro is doing for this venue, and what would make it do more. All
 * counts, none about a person.
 */
export default async function VenueInsightsPage({ searchParams }: { searchParams: { venue?: string; days?: string } }) {
  const { session, venue, imageUrl } = await venuePortal(searchParams.venue);
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const supabase = createClient();
  const q = (extra = "") => {
    const p = new URLSearchParams();
    if (session.venues.length > 1) p.set("venue", venue.id);
    if (extra) p.set("days", extra);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const link = (href: string) => {
    const [path, hash] = href.split("#");
    return `${path}${q()}${hash ? `#${hash}` : ""}`;
  };

  const [{ data: insights, error }, { data: me }, { data: area }] = await Promise.all([
    supabase.rpc("venue_insights", { p_venue: venue.id, p_days: days }),
    supabase.from("venues").select(CHECKLIST_VENUE_COLUMNS).eq("id", venue.id).maybeSingle(),
    supabase.from("venues").select("areas(name)").eq("id", venue.id).maybeSingle(),
  ]);
  const v = me as Record<string, unknown> | null;
  const owner = (v?.menu_shared_from as string | null) || venue.id;
  const menu = await fetchAllRows<Record<string, unknown>>((a, b) =>
    supabase.from("menu_items").select("*").in("venue_id", [...new Set([owner, venue.id])]).range(a, b)
  ).catch(() => [] as Record<string, unknown>[]);
  const areaName = ((area as { areas?: { name?: string } | null } | null)?.areas?.name) ?? "your area";
  const ins = (insights ?? null) as Insights | null;

  const liked = menu
    .filter((m) => Number(m.recommend_count ?? 0) > 0)
    .sort((a, b) => Number(b.recommend_count) - Number(a.recommend_count))
    .slice(0, 5);
  const checks = venueChecklist(v, menu).sort((a, b) => Number(a.ok) - Number(b.ok) || b.weight - a.weight);
  const score = checklistScore(checks);

  return (
    <VenueShell venues={session.venues} current={venue} imageUrl={imageUrl}>
      <div className="pl-up mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Insights</h1>
          <p className="mt-1 text-[15px] text-[var(--p-muted)]">How Duro is putting you in front of people. All counts; nothing here identifies a guest.</p>
        </div>
        <div className="flex rounded-full bg-white p-1 ring-1 ring-[var(--p-line)]">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/venue/insights${q(String(d))}`}
              className={`rounded-full px-3.5 py-1.5 text-[14px] font-bold transition-colors ${d === days ? "bg-[var(--p-ink)] text-white" : "text-[var(--p-ink-2)]"}`}
            >
              {d} days
            </Link>
          ))}
        </div>
      </div>

      {error || !ins ? (
        <div className="pl-card p-6 text-[15px] text-[var(--p-muted)]">Insights are being set up. Check back shortly.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { n: ins.in_plans, label: "In plans", note: `times Duro put you in an outing` },
              { n: ins.saved, label: "Kept", note: "plans with you that people saved" },
              { n: ins.table_requests, label: "Table requests", note: "sent to you from a plan" },
              { n: ins.area_plans, label: `Outings in ${areaName}`, note: `${ins.area_unmet} found nothing that fitted` },
            ].map((s, i) => (
              <div key={s.label} className="pl-card pl-up p-4" style={{ animationDelay: `${40 + i * 60}ms` }}>
                <div className="truncate text-[12.5px] font-bold uppercase tracking-[0.06em] text-[var(--p-muted)]">{s.label}</div>
                <div className="pl-pop mt-1 text-[32px] font-bold tabular-nums leading-tight" style={{ animationDelay: `${200 + i * 60}ms` }}>
                  {Number(s.n ?? 0).toLocaleString()}
                </div>
                <div className="text-[12.5px] leading-snug text-[var(--p-muted)]">{s.note}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Card title="What you're chosen for" delay={120}>
              <Bars rows={top(ins.by_occasion).map(([k, n]) => [OCCASION[k] ?? k, n])} empty="Not in any plans yet in this window." />
            </Card>
            <Card title="The days people plan you for" delay={170}>
              <Bars
                rows={DAYS.map((d, i) => [d, Number(ins.by_weekday?.[String(i)] ?? 0)] as [string, number]).filter(([, n]) => n > 0)}
                empty="Not in any plans yet in this window."
              />
            </Card>
            <Card title={`What people want in ${areaName}`} delay={220}>
              <Bars rows={top(ins.area_occasions).map(([k, n]) => [OCCASION[k] ?? k, n])} empty="No outings planned here yet." />
              {ins.area_unmet > 0 ? (
                <p className="mt-3 rounded-xl bg-[var(--p-warn-soft)] px-3 py-2 text-[13.5px] text-[var(--p-warn)]">
                  {ins.area_unmet} of {ins.area_plans} found nothing that fitted. That&apos;s demand you could fill: complete hours, prices and nights on the days people ask for.
                </p>
              ) : null}
            </Card>
            <Card title={`Budgets in ${areaName}`} delay={270}>
              <Bars rows={top(ins.area_budgets, 6).map(([k, n]) => [k === "free" ? "Free" : `GHS ${k}`, n])} empty="No outings planned here yet." />
            </Card>
          </div>
        </>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card title="Your listing" delay={320}>
          <div className="mb-4 flex items-center gap-4">
            <Ring value={score} size={72} stroke={8} />
            <p className="text-[14px] leading-snug text-[var(--p-muted)]">The fastest way to appear in more plans is a complete listing.</p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {checks.map((c) => (
              <li key={c.label}>
                {c.ok ? (
                  <div className="flex items-center gap-3 px-1 py-1.5 text-[14.5px] text-[var(--p-muted)]">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--p-ok)] text-white">
                      <IconCheck size={13} />
                    </span>
                    {c.label}
                  </div>
                ) : (
                  <Link href={link(c.href)} className="pl-lift group flex items-center gap-3 rounded-xl bg-[var(--p-sunken)] px-3 py-2.5">
                    <span className="h-6 w-6 shrink-0 rounded-full border-2 border-[var(--p-line)] bg-white" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold">{c.label}</span>
                      <span className="block text-[12.5px] text-[var(--p-muted)]">{c.why}</span>
                    </span>
                    <IconChevron className="text-[var(--p-muted)] transition-transform group-hover:translate-x-1" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Most recommended dishes" delay={370}>
          {liked.length ? (
            <ul className="grid gap-2 text-[15px]">
              {liked.map((m, i) => (
                <li key={String(m.id)} className="pl-up flex items-center justify-between gap-3" style={{ animationDelay: `${420 + i * 60}ms` }}>
                  <span className="truncate">{String(m.name)}</span>
                  <span className="shrink-0 rounded-full bg-[var(--p-ok-soft)] px-2.5 py-0.5 text-[13px] font-bold text-[var(--p-ok)]">👍 {String(m.recommend_count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] leading-relaxed text-[var(--p-muted)]">
              No recommendations yet. Only guests who planned a visit can recommend a dish, so these arrive after people come.
            </p>
          )}
        </Card>
      </div>
    </VenueShell>
  );
}

function Card({ title, children, delay }: { title: string; children: ReactNode; delay: number }) {
  return (
    <section className="pl-card pl-up p-5" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="mb-4 text-[18px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Bars({ rows, empty }: { rows: [string, number][]; empty: string }) {
  if (!rows.length) return <p className="text-[14px] text-[var(--p-muted)]">{empty}</p>;
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <ul className="grid gap-2.5 text-[14px]">
      {rows.map(([k, n], i) => (
        <li key={k} className="flex items-center gap-3">
          <span className="w-[38%] truncate font-semibold">{k}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--p-sunken)]">
            <span
              className="pl-grow block h-3 rounded-full bg-[var(--p-accent)]"
              style={{ width: `${Math.max(4, Math.round((100 * n) / max))}%`, animationDelay: `${200 + i * 90}ms` }}
            />
          </span>
          <span className="w-9 text-right font-bold tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}
