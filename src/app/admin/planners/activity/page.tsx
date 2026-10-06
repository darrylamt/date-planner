import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * What event planners have been doing in their portal (migration 0076).
 *
 * Planners publish with no approval step, so this is where that trust is
 * checked: every night and place they add, change or delete, with what
 * changed, and when they were last in. Read on the service role; the table
 * grants nothing to anybody signed in.
 */

interface Activity {
  id: number;
  at: string;
  user_id: string | null;
  action: string;
  entity_id: string | null;
  summary: string;
  changes: Record<string, [unknown, unknown]> | null;
}

interface Planner {
  user_id: string;
  username: string;
  display_name: string;
  logo_url: string | null;
  is_active: boolean;
}

const ACTIONS: Record<string, { label: string; tone: string }> = {
  "event.create": { label: "Put a night on", tone: "bg-[#d8f0ed] text-[#0b4f4a]" },
  "event.update": { label: "Changed a night", tone: "bg-[#e7eefb] text-[#1d4ed8]" },
  "event.delete": { label: "Deleted a night", tone: "bg-[#fdecea] text-[#b42318]" },
  "place.create": { label: "Added a place", tone: "bg-[#d8f0ed] text-[#0b4f4a]" },
  "place.update": { label: "Changed a place", tone: "bg-[#e7eefb] text-[#1d4ed8]" },
  "place.delete": { label: "Deleted a place", tone: "bg-[#fdecea] text-[#b42318]" },
  "area.create": { label: "New part of town", tone: "bg-[#fdf1dc] text-[#9e4a07]" },
  "logo.update": { label: "Changed logo", tone: "bg-[#eef1f5] text-[#46505f]" },
  "logo.remove": { label: "Removed logo", tone: "bg-[#eef1f5] text-[#46505f]" },
  visit: { label: "Visit", tone: "bg-[#eef1f5] text-[#5c6470]" },
};

/** Fields named as a planner would, and the ones not worth showing at all. */
const FIELD: Record<string, string> = {
  title: "Name",
  event_date: "Date",
  start_time: "Starts",
  cost_ghs: "Entry, GHS",
  venue_id: "Place",
  area_id: "Part of town",
  category: "Kind",
  vibe_tags: "Vibe",
  description: "Description",
  image_url: "Poster or photo",
  contact_phone: "Phone",
  booking_url: "Ticket link",
  audience: "Who can come",
  is_active: "Live",
  name: "Name",
  type: "Kind of place",
  google_maps_url: "Maps link",
  address: "Address",
  logo_url: "Logo",
};
const QUIET = new Set(["organiser_name", "organiser_logo_url", "created_by", "external_key", "source_url", "id"]);

const accra = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", ...opts });

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : accra(iso, { day: "numeric", month: "short", year: "numeric" });
}

function dayHeading(iso: string): string {
  const day = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return accra(iso, { weekday: "long", day: "numeric", month: "long" });
}

export default async function PlannerActivityPage({ searchParams }: { searchParams: { planner?: string; show?: string } }) {
  const supabase = await adminDataClient();
  const show = searchParams.show === "visits" ? "visits" : searchParams.show === "all" ? "all" : "changes";

  let query = supabase.from("planner_activity").select("*").order("at", { ascending: false }).limit(400);
  if (searchParams.planner) query = query.eq("user_id", searchParams.planner);
  if (show === "changes") query = query.neq("action", "visit");
  if (show === "visits") query = query.eq("action", "visit");

  const [{ data: rows, error }, { data: plannerRows }, { data: recent }] = await Promise.all([
    query,
    supabase.from("event_planners").select("user_id, username, display_name, logo_url, is_active").order("display_name"),
    // Everything from the last week, for the counts on each planner's card.
    supabase.from("planner_activity").select("user_id, action, at").gte("at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(5000),
  ]);

  const planners = (plannerRows ?? []) as Planner[];
  const byId = new Map(planners.map((p) => [p.user_id, p]));
  const activity = (rows ?? []) as Activity[];

  // When each planner last signed in, from the auth record.
  const signIns = new Map<string, string | null>();
  await Promise.all(
    planners.map(async (p) => {
      const { data } = await supabase.auth.admin.getUserById(p.user_id);
      signIns.set(p.user_id, data.user?.last_sign_in_at ?? null);
    })
  );

  // Nights still to come, per planner.
  const today = new Date().toISOString().slice(0, 10);
  const { data: upcoming } = planners.length
    ? await supabase.from("events").select("created_by").eq("is_active", true).gte("event_date", today).in("created_by", planners.map((p) => p.user_id))
    : { data: [] };
  const nightsAhead = new Map<string, number>();
  for (const e of (upcoming ?? []) as { created_by: string }[]) nightsAhead.set(e.created_by, (nightsAhead.get(e.created_by) ?? 0) + 1);

  const week = (recent ?? []) as { user_id: string; action: string; at: string }[];
  const lastVisit = new Map<string, string>();
  const changesThisWeek = new Map<string, number>();
  for (const r of week) {
    if (r.action === "visit") {
      if (!lastVisit.has(r.user_id) || r.at > lastVisit.get(r.user_id)!) lastVisit.set(r.user_id, r.at);
    } else changesThisWeek.set(r.user_id, (changesThisWeek.get(r.user_id) ?? 0) + 1);
  }

  // Names for the places and areas that appear in the changes.
  const placeIds = new Set<string>();
  const areaIds = new Set<string>();
  for (const a of activity) {
    for (const [k, pair] of Object.entries(a.changes ?? {})) {
      for (const v of pair ?? []) {
        if (typeof v !== "string") continue;
        if (k === "venue_id") placeIds.add(v);
        if (k === "area_id") areaIds.add(v);
      }
    }
  }
  const [{ data: placeNames }, { data: areaNames }] = await Promise.all([
    placeIds.size ? supabase.from("venues").select("id, name").in("id", [...placeIds]) : Promise.resolve({ data: [] }),
    areaIds.size ? supabase.from("areas").select("id, name").in("id", [...areaIds]) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>([
    ...((placeNames ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name] as [string, string]),
    ...((areaNames ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name] as [string, string]),
  ]);

  const shown = (field: string, value: unknown): string => {
    if (value == null || value === "") return "empty";
    if ((field === "venue_id" || field === "area_id") && typeof value === "string") return names.get(value) ?? "a place no longer listed";
    if (field === "image_url" || field === "logo_url") return "a picture";
    if (field === "start_time" && typeof value === "string") return value.slice(0, 5);
    if (field === "is_active") return value ? "yes" : "no";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
    const text = String(value);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  };

  const link = (params: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { planner: searchParams.planner, show: searchParams.show, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    return `/admin/planners/activity${qs ? `?${qs}` : ""}`;
  };

  const groups: { day: string; items: Activity[] }[] = [];
  for (const a of activity) {
    const day = dayHeading(a.at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(a);
    else groups.push({ day, items: [a] });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">Planner activity</h1>
          <div className="text-[14px] text-mutedbrown">
            Everything event planners add, change or delete in their portal, and when they were in. Their nights and places go live with no
            review, so this is where you check them.
          </div>
        </div>
        <Link href="/admin/planners" className="text-[14px] font-semibold text-flame">
          Planner logins →
        </Link>
      </div>

      {error ? (
        <div className="card mt-5 p-5 text-[14px]">
          <div className="font-bold">The activity log is not switched on yet.</div>
          <p className="mt-1 text-mutedbrown">
            Run <code>supabase/migrations/0076_planner_activity.sql</code> in the Supabase SQL editor. Activity is recorded from then on.
          </p>
        </div>
      ) : null}

      {/* ── Who ── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {planners.map((p) => {
          const on = searchParams.planner === p.user_id;
          return (
            <Link
              key={p.user_id}
              href={link({ planner: on ? undefined : p.user_id })}
              className={`card block p-4 transition-colors ${on ? "ring-2 ring-flame" : "hover:border-flame"}`}
            >
              <div className="flex items-center gap-3">
                {p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain ring-1 ring-black/10" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-flame text-[16px] font-bold text-blush">
                    {p.display_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold">{p.display_name}</div>
                  <div className="text-[12.5px] text-mutedbrown">
                    {p.username}
                    {p.is_active ? "" : " · switched off"}
                  </div>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                <dt className="text-mutedbrown">Signed in</dt>
                <dd className="text-right font-semibold">{ago(signIns.get(p.user_id))}</dd>
                <dt className="text-mutedbrown">In the portal</dt>
                <dd className="text-right font-semibold">{ago(lastVisit.get(p.user_id))}</dd>
                <dt className="text-mutedbrown">Nights coming up</dt>
                <dd className="text-right font-semibold">{nightsAhead.get(p.user_id) ?? 0}</dd>
                <dt className="text-mutedbrown">Changes this week</dt>
                <dd className="text-right font-semibold">{changesThisWeek.get(p.user_id) ?? 0}</dd>
              </dl>
            </Link>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="mt-6 flex flex-wrap items-center gap-2 text-[13.5px]">
        {(
          [
            ["changes", "Changes"],
            ["visits", "Visits"],
            ["all", "Everything"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={link({ show: key === "changes" ? undefined : key })}
            className={`rounded-full px-3.5 py-1.5 font-semibold ${show === key ? "bg-flame text-blush" : "border border-line text-cocoa hover:border-flame"}`}
          >
            {label}
          </Link>
        ))}
        {searchParams.planner ? (
          <Link href={link({ planner: undefined })} className="ml-1 font-semibold text-flame">
            Showing {byId.get(searchParams.planner)?.display_name ?? "one planner"} · show all planners
          </Link>
        ) : null}
      </div>

      {/* ── What ── */}
      {!error && !activity.length ? (
        <div className="card mt-4 p-5 text-[14px] text-mutedbrown">Nothing recorded yet{searchParams.planner ? " for this planner" : ""}.</div>
      ) : null}

      <div className="mt-4 flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.day}>
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-mutedbrown">{g.day}</h2>
            <div className="card divide-y divide-line">
              {g.items.map((a) => {
                const kind = ACTIONS[a.action] ?? { label: a.action, tone: "bg-[#eef1f5] text-[#46505f]" };
                const who = a.user_id ? byId.get(a.user_id) : null;
                const fields = Object.entries(a.changes ?? {}).filter(([k]) => !QUIET.has(k));
                const href =
                  a.entity_id && a.action.startsWith("place.") && a.action !== "place.delete"
                    ? `/admin/venues/${a.entity_id}`
                    : a.entity_id && a.action.startsWith("event.") && a.action !== "event.delete"
                      ? "/admin/events"
                      : null;
                return (
                  <div key={a.id} className="flex gap-3 px-4 py-3">
                    <div className="w-[52px] shrink-0 pt-0.5 font-mono text-[12.5px] text-mutedbrown">{accra(a.at, { hour: "2-digit", minute: "2-digit" })}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${kind.tone}`}>{kind.label}</span>
                        <span className="text-[13px] font-semibold">{who?.display_name ?? "A planner no longer listed"}</span>
                      </div>
                      <div className="mt-1 text-[14.5px]">
                        {href ? (
                          <Link href={href} className="hover:text-flame hover:underline">
                            {a.summary}
                          </Link>
                        ) : (
                          a.summary
                        )}
                      </div>
                      {fields.length ? (
                        <details className="mt-1.5 text-[13px]" open={a.action.endsWith(".update") && fields.length <= 3}>
                          <summary className="cursor-pointer font-semibold text-mutedbrown">
                            {a.action.endsWith(".update") ? `${fields.length} change${fields.length === 1 ? "" : "s"}` : "Details"}
                          </summary>
                          <ul className="mt-1.5 grid gap-1">
                            {fields.map(([k, pair]) => (
                              <li key={k} className="rounded-md bg-cream/60 px-2.5 py-1.5">
                                <span className="font-semibold">{FIELD[k] ?? k}:</span>{" "}
                                {pair?.[0] != null && pair[0] !== "" ? (
                                  <>
                                    <span className="text-mutedbrown line-through">{shown(k, pair[0])}</span> →{" "}
                                  </>
                                ) : null}
                                <span>{shown(k, pair?.[1])}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {activity.length >= 400 ? <p className="mt-4 text-[13px] text-mutedbrown">Showing the latest 400. Pick a planner to see further back.</p> : null}
    </div>
  );
}
