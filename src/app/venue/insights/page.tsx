import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { chosenVenue, requireVenueUser } from "@/lib/venueAuth";
import { VenueNav } from "@/components/venue/VenueNav";
import { fetchAllRows } from "@/lib/fetchAll";

export const dynamic = "force-dynamic";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
  days: number;
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

const top = (o: Record<string, number>, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * What Duro is doing for this venue, and what would make it do more.
 *
 * Three kinds of number, all counts, none about a person: how often plans
 * put the venue in front of somebody, how many of those people kept the plan
 * or asked for a table, and what is being asked for in its area, including
 * how often we could find nothing that fitted, which is the opening a venue
 * can fill. Then the listing itself, scored, because the fastest way for a
 * venue to appear in more plans is a complete one.
 */
export default async function VenueInsightsPage({
  searchParams,
}: {
  searchParams: { venue?: string; days?: string };
}) {
  const session = await requireVenueUser();
  const venue = chosenVenue(session, searchParams.venue);
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const supabase = createClient();

  const [{ data: insights, error }, { data: me }] = await Promise.all([
    supabase.rpc("venue_insights", { p_venue: venue.id, p_days: days }),
    supabase
      .from("venues")
      .select("id, name, image_url, gallery_urls, description, opening_periods, phone, whatsapp_phone, booking_url, instagram_handle, menu_shared_from, areas(name)")
      .eq("id", venue.id)
      .maybeSingle(),
  ]);
  const v = me as Record<string, unknown> | null;
  const owner = (v?.menu_shared_from as string | null) || venue.id;
  const menu = await fetchAllRows<Record<string, unknown>>((a, b) =>
    supabase.from("menu_items").select("*").in("venue_id", [owner, venue.id]).range(a, b)
  ).catch(() => [] as Record<string, unknown>[]);
  const areaName = (v?.areas as { name?: string } | null)?.name ?? "your area";
  const ins = (insights ?? null) as Insights | null;

  const liked = menu
    .filter((m) => Number(m.recommend_count ?? 0) > 0)
    .sort((a, b) => Number(b.recommend_count) - Number(a.recommend_count))
    .slice(0, 5);

  /*
   * The listing, scored. Each line is something the planner or the app
   * actually uses: a venue with no hours cannot be planned for a given night
   * with confidence, one with no prices is withheld from plans altogether, and
   * a menu without descriptions shows guests a list of names.
   */
  const withNotes = menu.filter((m) => String(m.notes ?? "").trim()).length;
  const withPics = menu.filter((m) => String(m.image_url ?? "").trim()).length;
  const checks: { ok: boolean; label: string; why: string; href: string }[] = [
    { ok: Boolean(v?.image_url), label: "A main photo", why: "Every card and page leads with it.", href: "/venue/listing" },
    {
      ok: ((v?.gallery_urls as string[] | null) ?? []).length >= 3,
      label: "At least three more photos",
      why: "Guests swipe through them before they choose.",
      href: "/venue/listing",
    },
    { ok: String(v?.description ?? "").length > 60, label: "A description", why: "Tells guests what you are like in your words.", href: "/venue/listing" },
    {
      ok: Array.isArray(v?.opening_periods) && (v?.opening_periods as unknown[]).length > 0,
      label: "Opening hours",
      why: "We only plan evenings around places we know are open.",
      href: "/venue/hours",
    },
    { ok: menu.length >= 10, label: "A priced menu", why: "Venues without prices are left out of plans with a budget.", href: "/venue/menu" },
    {
      ok: menu.length > 0 && withNotes / menu.length >= 0.6,
      label: "Descriptions on most menu items",
      why: `${withNotes} of ${menu.length} items have one. Guests read these on each item's page.`,
      href: "/venue/menu",
    },
    {
      ok: withPics >= Math.min(5, menu.length),
      label: "Pictures of your best dishes",
      why: `${withPics} items have a picture. Five is enough to change what people order.`,
      href: "/venue/menu",
    },
    {
      ok: Boolean(v?.booking_url || v?.whatsapp_phone || v?.phone),
      label: "A way to book",
      why: "A booking link or WhatsApp number turns a plan into a table request.",
      href: "/venue/listing",
    },
    { ok: Boolean(v?.instagram_handle), label: "Your Instagram", why: "Guests check it before they go.", href: "/venue/listing" },
  ];
  const score = Math.round((100 * checks.filter((c) => c.ok).length) / checks.length);
  const withVenue = (href: string) => (session.venues.length > 1 ? `${href}?venue=${venue.id}` : href);

  return (
    <>
      <Suspense>
        <VenueNav venues={session.venues} currentVenueId={venue.id} planner={session.planner} />
      </Suspense>

      <main className="admin-main mx-auto w-full max-w-[1080px] px-5 py-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-[24px] font-bold">Insights</h1>
          <div className="flex gap-2 text-[13px]">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={`/venue/insights?days=${d}${session.venues.length > 1 ? `&venue=${venue.id}` : ""}`}
                className={`rounded-full px-3 py-1 font-semibold ${d === days ? "bg-ink text-white" : "bg-white ring-1 ring-black/10"}`}
              >
                {d} days
              </Link>
            ))}
          </div>
        </div>
        <p className="mb-6 mt-1 text-[14px] text-mutedbrown">
          How Duro is putting you in front of people, and what would put you in front of more. All counts; nothing here
          identifies a guest.
        </p>

        {error || !ins ? (
          <div className="card p-5 text-[14px] text-mutedbrown">
            Insights are being set up. Check back shortly.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="In plans" value={ins.in_plans} note={`times Duro put you in an outing, last ${days} days`} />
              <Stat label="Kept" value={ins.saved} note="plans with you in them that people saved" />
              <Stat label="Table requests" value={ins.table_requests} note="sent to you from a plan" />
              <Stat label={`Outings planned in ${areaName}`} value={ins.area_plans} note={`${ins.area_unmet} found nothing that fitted`} />
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Card title="What you are chosen for">
                <Bars rows={top(ins.by_occasion).map(([k, n]) => [OCCASION[k] ?? k, n])} empty="Not in any plans yet in this window." />
              </Card>
              <Card title="The days people plan you for">
                <Bars
                  rows={DAYS.map((d, i) => [d, Number(ins.by_weekday[String(i)] ?? 0)] as [string, number]).filter(([, n]) => n > 0)}
                  empty="Not in any plans yet in this window."
                />
              </Card>
              <Card title={`What people want in ${areaName}`}>
                <Bars rows={top(ins.area_occasions).map(([k, n]) => [OCCASION[k] ?? k, n])} empty="No outings planned here yet." />
                {ins.area_unmet > 0 ? (
                  <p className="mt-3 text-[13px] text-mutedbrown">
                    {ins.area_unmet} of {ins.area_plans} found nothing that fitted. Complete hours and prices, and events on the
                    nights people ask for, are how you fill that.
                  </p>
                ) : null}
              </Card>
              <Card title={`Budgets in ${areaName}`}>
                <Bars rows={top(ins.area_budgets, 6).map(([k, n]) => [k === "free" ? "Free" : `GHS ${k}`, n])} empty="No outings planned here yet." />
              </Card>
            </div>
          </>
        )}

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Card title="Your most recommended">
            {liked.length ? (
              <ul className="grid gap-1.5 text-[14px]">
                {liked.map((m) => (
                  <li key={String(m.id)} className="flex justify-between gap-3">
                    <span>{String(m.name)}</span>
                    <span className="font-mono text-mutedbrown">👍 {String(m.recommend_count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-mutedbrown">
                Nobody has recommended a dish yet. Recommendations count only from guests who planned a visit, so they
                arrive after people come.
              </p>
            )}
          </Card>

          <Card title={`Your listing: ${score}% complete`}>
            <ul className="grid gap-2 text-[13.5px]">
              {checks.map((c) => (
                <li key={c.label} className="flex gap-2">
                  <span>{c.ok ? "✅" : "⬜"}</span>
                  <span className="flex-1">
                    {c.ok ? (
                      <b>{c.label}</b>
                    ) : (
                      <Link href={withVenue(c.href)} className="font-bold text-flame hover:underline">
                        {c.label}
                      </Link>
                    )}
                    <span className="block text-mutedbrown">{c.why}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-mutedbrown">{label}</div>
      <div className="mt-1 font-display text-[26px] font-bold">{value.toLocaleString()}</div>
      <div className="text-[12px] text-mutedbrown">{note}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="mb-3 font-display text-[17px] font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Bars({ rows, empty }: { rows: [string, number][]; empty: string }) {
  if (!rows.length) return <p className="text-[13px] text-mutedbrown">{empty}</p>;
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <ul className="grid gap-1.5 text-[13px]">
      {rows.map(([k, n]) => (
        <li key={k} className="flex items-center gap-3">
          <span className="w-[40%] truncate">{k}</span>
          <span className="h-2 flex-1 rounded bg-black/5">
            <span className="block h-2 rounded bg-flame" style={{ width: `${Math.round((100 * n) / max)}%` }} />
          </span>
          <span className="w-10 text-right font-mono">{n}</span>
        </li>
      ))}
    </ul>
  );
}
