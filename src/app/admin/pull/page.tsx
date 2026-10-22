import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { PULL } from "@/lib/pull";
import { RecomputePull } from "@/components/admin/RecomputePull";

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
 */
export default async function PullPage() {
  const supabase = await adminDataClient();
  const since = new Date(Date.now() - 7 * 864e5).toISOString();

  const [{ data, error }, ...kindCounts] = await Promise.all([
    supabase.from("venue_pull").select("*, venues(name, areas(name))").order("effect", { ascending: false }),
    ...KINDS.map(([k]) =>
      supabase.from("plan_signals").select("id", { count: "exact", head: true }).eq("kind", k).gte("created_at", since)
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
  const computed = rows[0]?.computed_at;
  // The points without the new-venue nudge: what people's choices alone say.
  const lean = (r: Row) => r.effect - PULL.exploreMax * Math.max(0, 1 - r.shown / PULL.exploreBelow);
  const judged = rows.filter((r) => r.confidence >= 0.25);
  const ahead = [...judged].sort((a, b) => lean(b) - lean(a)).filter((r) => lean(r) > 0.05).slice(0, 20);
  const behind = [...judged].sort((a, b) => lean(a) - lean(b)).filter((r) => lean(r) < -0.05).slice(0, 20);
  const unseen = rows.filter((r) => r.shown < 1).length;
  const totalKept = rows.reduce((s, r) => s + Number(r.kept), 0);
  const totalSwapped = rows.reduce((s, r) => s + Number(r.swapped), 0);
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

      <section className="mt-6">
        <h2 className="adm-section-title">The last 7 days</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {KINDS.map(([k, label], i) => (
            <div key={k} className="adm-tile block">
              <div className="text-[12.5px] font-semibold text-mutedbrown">{label}</div>
              <div className="adm-num mt-1.5 !text-[24px] text-ink">{(kindCounts[i].count ?? 0).toLocaleString("en-GB")}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <div className="adm-tile block">
          <div className="text-[12.5px] font-semibold text-mutedbrown">Kept, across 90 days</div>
          <div className="adm-num mt-1.5 text-ink">
            {totalKept + totalSwapped > 0 ? `${Math.round((totalKept / (totalKept + totalSwapped)) * 100)}%` : "–"}
          </div>
          <div className="mt-1 text-[12px] text-mutedbrown">of everything kept or swapped, older days counting less</div>
        </div>
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

      <PullTable title="Pulling ahead" empty="Nobody has pulled ahead yet: it takes a few saves or swaps per venue." rows={ahead} lean={lean} />
      <PullTable title="Being swapped out" empty="Nothing is being swapped out more than the average yet." rows={behind} lean={lean} />
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
