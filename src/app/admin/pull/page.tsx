import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { PULL } from "@/lib/pull";
import { RecomputePull } from "@/components/admin/RecomputePull";
import { PeriodPicker, periodFrom } from "@/components/admin/Period";

export const dynamic = "force-dynamic";

type Row = {
  venue_id: string;
  computed_at: string;
  shown: number;
  kept: number;
  swapped: number;
  engaged: number;
  views: number;
  dwell_ms: number | null;
  rate: number | null;
  confidence: number;
  effect: number;
  venues: { name: string; areas: { name: string } | null } | null;
};

type Recent = {
  id: number;
  created_at: string;
  kind: string;
  device_id: string;
  venue_id: string;
  value: number | null;
  venues: { name: string } | null;
};

const SAID: Record<string, string> = {
  shown: "Shown in a plan",
  swapped_away: "Swapped out",
  swapped_in: "Swapped in",
  saved: "Saved in a plan",
  shared: "Shared in a plan",
  details_opened: "Details opened",
  menu_opened: "Menu opened",
  book_tapped: "Book tapped",
  directions_tapped: "Get there tapped",
  maps_opened: "Opened in Maps",
  instagram_opened: "Instagram opened",
  venue_viewed: "Venue page visited",
};

const KINDS: [string, string][] = [
  ["shown", "Shown in a plan"],
  ["swapped_away", "Swapped out"],
  ["saved", "Saved"],
  ["shared", "Shared"],
  ["details_opened", "Details opened"],
  ["menu_opened", "Menu opened"],
  ["book_tapped", "Book tapped"],
  ["directions_tapped", "Get there tapped"],
  ["venue_viewed", "Venue page visits"],
];

/**
 * Pull: which places people keep once a plan shows them, and which they swap
 * out (pull.ts). Worked out nightly from plan_signals; the planner adds each
 * venue's points to its score.
 *
 * Shows the raw activity as well as the judgement, because the judgement
 * stays empty until there is enough to judge by, and an empty page read as
 * "nothing is being recorded" when plenty was.
 */
export default async function PullPage({ searchParams }: { searchParams: { period?: string } }) {
  const supabase = await adminDataClient();
  const period = periodFrom(searchParams.period);

  const [{ data, error }, { data: recentRaw }, ...kindCounts] = await Promise.all([
    supabase.from("venue_pull").select("*, venues(name, areas(name))").order("effect", { ascending: false }),
    supabase
      .from("plan_signals")
      .select("id, created_at, kind, device_id, venue_id, value, venues(name)")
      .order("id", { ascending: false })
      .limit(60),
    ...KINDS.map(([k]) =>
      period.since
        ? supabase.from("plan_signals").select("id", { count: "exact", head: true }).eq("kind", k).gte("created_at", period.since)
        : supabase.from("plan_signals").select("id", { count: "exact", head: true }).eq("kind", k)
    ),
  ]);

  if (error) {
    return (
      <div>
        <h1>Pull</h1>
        <div className="why mt-4">
          venue_pull isn&apos;t there yet. Run migration 0091 in the Supabase SQL editor, then press Recompute now.
        </div>
        <div className="mt-4">
          <RecomputePull />
        </div>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Row[];
  const recent = (recentRaw ?? []) as unknown as Recent[];
  const computed = rows[0]?.computed_at;
  // The points without the new-venue nudge: what people's choices alone say.
  const lean = (r: Row) => Number(r.effect) - PULL.exploreMax * Math.max(0, 1 - Number(r.shown) / PULL.exploreBelow);
  const judged = rows.filter((r) => r.confidence >= 0.25);
  const ahead = [...judged].sort((a, b) => lean(b) - lean(a)).filter((r) => lean(r) > 0.05).slice(0, 20);
  const behind = [...judged].sort((a, b) => lean(a) - lean(b)).filter((r) => lean(r) < -0.05).slice(0, 20);
  const unseen = rows.filter((r) => r.shown < 1).length;
  const totalKept = rows.reduce((s, r) => s + Number(r.kept), 0);
  const totalSwapped = rows.reduce((s, r) => s + Number(r.swapped), 0);
  const total = totalKept + totalSwapped;
  const live = total >= PULL.minTotal;
  // Every venue anyone has done anything with, judged or not.
  const active = rows
    .filter((r) => r.shown > 0 || r.kept > 0 || r.swapped > 0 || r.engaged > 0 || r.views > 0)
    .sort(
      (a, b) => Number(b.kept) + Number(b.swapped) - (Number(a.kept) + Number(a.swapped)) || b.views - a.views
    );
  const when = computed
    ? new Date(computed).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Pull</h1>
          <p className="max-w-[680px] text-[14px] text-mutedbrown">
            Which places people keep once a plan shows them, and which they swap out. Saves and shares count most, Book and
            Get there half, a look at the menu a quarter; a swap counts against. Worth at most {PULL.cap} points in a plan,
            less than one vibe tag. {when ? `Last worked out ${when}.` : "Not worked out yet."}
          </p>
        </div>
        <RecomputePull />
      </div>

      {/* Whether pull is moving plans yet, and how far off it is. */}
      <div className="adm-tile mt-6 block" data-tone={live ? undefined : "clear"}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[14px] font-semibold text-ink">
            {live ? "Pull is moving plans" : "Pull is listening, not moving plans yet"}
          </div>
          <div className="text-[13px] tabular-nums text-mutedbrown">
            {Math.min(total, PULL.minTotal).toFixed(0)} of {PULL.minTotal} keeps or swaps
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5e1dc]">
          <div
            className="h-full rounded-full bg-[#c92c58]"
            style={{ width: `${Math.min(100, (total / PULL.minTotal) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-[12.5px] text-mutedbrown">
          {live
            ? "Each venue gains or loses up to two points in plans by how often it is kept rather than swapped out."
            : `Until the whole catalogue has ${PULL.minTotal} between them, no venue gains or loses points: too little to tell a good place from an unlucky one. Everything people do is still recorded below.`}
        </p>
      </div>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="adm-section-title">{period.heading}</h2>
          <PeriodPicker path="/admin/pull" current={period.key} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {KINDS.map(([k, label], i) => (
            <div key={k} className="adm-tile block">
              <div className="text-[12.5px] font-semibold text-mutedbrown">{label}</div>
              <div className="adm-num mt-1.5 !text-[24px] text-ink">{(kindCounts[i].count ?? 0).toLocaleString("en-GB")}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="adm-section-title">Every venue with activity</h2>
        <p className="mt-1 text-[13px] text-mutedbrown">
          Raw, before any judging, as of the last time pull was worked out. Weighted: a month-old action counts half, and
          one phone adds at most two kept or two swapped out to any venue.
        </p>
        {active.length === 0 ? (
          <div className="adm-tile mt-3 text-[14px] text-mutedbrown" data-tone="clear">
            Nothing yet. Press Recompute now once people have used the app.
          </div>
        ) : (
          <div className="card mt-3 overflow-x-auto p-0">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Shown</th>
                  <th>Kept</th>
                  <th>Swapped out</th>
                  <th>Looked at</th>
                  <th>Page visits</th>
                  <th>Points now</th>
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 100).map((r) => (
                  <tr key={r.venue_id}>
                    <td>
                      <Link href={`/admin/venues/${r.venue_id}`} className="font-semibold hover:underline">
                        {r.venues?.name ?? "?"}
                      </Link>
                      <div className="text-[12px] text-mutedbrown">{r.venues?.areas?.name ?? ""}</div>
                    </td>
                    <td className="tabular-nums">{Number(r.shown).toFixed(1)}</td>
                    <td className="tabular-nums">{Number(r.kept).toFixed(1)}</td>
                    <td className="tabular-nums">{Number(r.swapped).toFixed(1)}</td>
                    <td className="tabular-nums">{Number(r.engaged).toFixed(1)}</td>
                    <td className="tabular-nums">
                      {r.views}
                      {r.dwell_ms != null ? <span className="text-mutedbrown"> · {Math.round(r.dwell_ms / 1000)}s</span> : null}
                    </td>
                    <td className="tabular-nums">
                      {Math.abs(lean(r)) < 0.005 ? "0" : `${lean(r) > 0 ? "+" : ""}${lean(r).toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="adm-section-title">Latest activity</h2>
        <p className="mt-1 text-[13px] text-mutedbrown">
          As it arrives from the app. The table above catches up when pull is worked out: nightly, or Recompute now.
        </p>
        {recent.length === 0 ? (
          <div className="adm-tile mt-3 text-[14px] text-mutedbrown" data-tone="clear">
            Nothing recorded yet.
          </div>
        ) : (
          <div className="card mt-3 overflow-x-auto p-0">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Venue</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap tabular-nums text-mutedbrown">
                      {new Date(r.created_at).toLocaleString("en-GB", {
                        timeZone: "Africa/Accra",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td
                      className={
                        r.kind === "swapped_away"
                          ? "font-semibold text-[#b42318]"
                          : r.kind === "saved" || r.kind === "shared"
                            ? "font-semibold text-[#0f766e]"
                            : ""
                      }
                    >
                      {SAID[r.kind] ?? r.kind}
                      {r.kind === "venue_viewed" && r.value != null ? (
                        <span className="font-normal text-mutedbrown"> · {Math.round(r.value / 1000)}s</span>
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/admin/venues/${r.venue_id}`} className="hover:underline">
                        {r.venues?.name ?? "?"}
                      </Link>
                    </td>
                    {/* The start of a random id: tells phones apart, says nothing about who. */}
                    <td className="font-mono text-[12px] text-mutedbrown">{r.device_id.slice(0, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="adm-tile block">
          <div className="text-[12.5px] font-semibold text-mutedbrown">Venues with enough to judge</div>
          <div className="adm-num mt-1.5 text-ink">{judged.length}</div>
          <div className="mt-1 text-[12px] text-mutedbrown">of {rows.length} live venues</div>
        </div>
        <div className="adm-tile block">
          <div className="text-[12.5px] font-semibold text-mutedbrown">Not shown in a plan yet</div>
          <div className="adm-num mt-1.5 text-ink">{unseen}</div>
          <div className="mt-1 text-[12px] text-mutedbrown">each gets a small nudge until it has been</div>
        </div>
      </section>

      <PullTable title="Pulling ahead" empty="Nobody has pulled ahead yet." rows={ahead} lean={lean} />
      <PullTable title="Being swapped out more than most" empty="Nobody is being swapped out more than most yet." rows={behind} lean={lean} />
    </div>
  );
}

function PullTable({ title, empty, rows, lean }: { title: string; empty: string; rows: Row[]; lean: (r: Row) => number }) {
  return (
    <section className="mt-8">
      <h2 className="adm-section-title">{title}</h2>
      {rows.length === 0 ? (
        <div className="adm-tile mt-3 text-[14px] text-mutedbrown" data-tone="clear">
          {empty}
        </div>
      ) : (
        <div className="card mt-3 overflow-x-auto p-0">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Shown</th>
                <th>Kept</th>
                <th>Swapped</th>
                <th>Keep rate</th>
                <th>Evidence</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.venue_id}>
                  <td>
                    <Link href={`/admin/venues/${r.venue_id}`} className="font-semibold hover:underline">
                      {r.venues?.name ?? "?"}
                    </Link>
                    <div className="text-[12px] text-mutedbrown">{r.venues?.areas?.name ?? ""}</div>
                  </td>
                  <td className="tabular-nums">{Number(r.shown).toFixed(1)}</td>
                  <td className="tabular-nums">{Number(r.kept).toFixed(1)}</td>
                  <td className="tabular-nums">{Number(r.swapped).toFixed(1)}</td>
                  <td className="tabular-nums">{r.rate == null ? "–" : `${Math.round(Number(r.rate) * 100)}%`}</td>
                  <td className="tabular-nums">{Math.round(Number(r.confidence) * 100)}%</td>
                  <td className={`font-semibold tabular-nums ${lean(r) >= 0 ? "text-[#0f766e]" : "text-[#b42318]"}`}>
                    {lean(r) >= 0 ? "+" : ""}
                    {lean(r).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
