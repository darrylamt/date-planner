import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { PULL } from "@/lib/pull";
import { RecomputePull } from "@/components/admin/RecomputePull";
import { PeriodPicker, periodFrom } from "@/components/admin/Period";
import { PagedTable } from "@/components/admin/PagedTable";

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
  item: string | null;
  venues: { name: string } | null;
};

const SAID: Record<string, string> = {
  shown: "Put in a plan",
  swapped_away: "Swapped out",
  swapped_in: "Swapped in",
  saved: "Plan saved",
  shared: "Plan shared",
  details_opened: "Opened its details",
  menu_opened: "Opened its menu",
  book_tapped: "Tapped Book",
  directions_tapped: "Tapped Get there",
  maps_opened: "Opened in Maps",
  instagram_opened: "Opened Instagram",
  venue_viewed: "Visited its page",
  dish_added: "Added a dish",
  dish_removed: "Took a dish off",
};

const KINDS: [string, string][] = [
  ["shown", "Put in a plan"],
  ["saved", "Plans saved"],
  ["swapped_away", "Swapped out"],
  ["menu_opened", "Menus opened"],
  ["book_tapped", "Book tapped"],
  ["directions_tapped", "Get there tapped"],
  ["venue_viewed", "Venue page visits"],
  ["dish_added", "Dishes added"],
];

/**
 * Pull, explained for the person reading it: which places people keep once
 * Duro puts them in a plan, and which they swap out, and what that does to
 * the next plans (pull.ts).
 */
export default async function PullPage({ searchParams }: { searchParams: { period?: string } }) {
  const supabase = await adminDataClient();
  const period = periodFrom(searchParams.period);
  const count = (k: string) => {
    let q = supabase.from("plan_signals").select("id", { count: "exact", head: true }).eq("kind", k);
    if (period.since) q = q.gte("created_at", period.since);
    return q;
  };

  const [{ data, error }, { data: recentRaw }, ...kindCounts] = await Promise.all([
    supabase.from("venue_pull").select("*, venues(name, areas(name))").order("effect", { ascending: false }),
    supabase
      .from("plan_signals")
      .select("id, created_at, kind, device_id, venue_id, value, item, venues(name)")
      .order("id", { ascending: false })
      .limit(300),
    ...KINDS.map(([k]) => count(k)),
  ]);

  if (error) {
    return (
      <div>
        <h1>Pull</h1>
        <div className="why mt-4">Pull needs migration 0091. Run it in the Supabase SQL editor, then press Recompute now.</div>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as Row[];
  const recent = (recentRaw ?? []) as unknown as Recent[];
  const computed = rows[0]?.computed_at;
  // What people's choices alone do to a place, without the small nudge every rarely-shown place gets.
  const lean = (r: Row) => Number(r.effect) - PULL.exploreMax * Math.max(0, 1 - Number(r.shown) / PULL.exploreBelow);
  const totalKept = rows.reduce((s, r) => s + Number(r.kept), 0);
  const totalSwapped = rows.reduce((s, r) => s + Number(r.swapped), 0);
  const total = totalKept + totalSwapped;
  const live = total >= PULL.minTotal;
  const active = rows
    .filter((r) => r.shown > 0 || r.kept > 0 || r.swapped > 0 || r.engaged > 0 || r.views > 0)
    .sort((a, b) => Math.abs(lean(b)) - Math.abs(lean(a)) || Number(b.kept) + Number(b.swapped) - (Number(a.kept) + Number(a.swapped)));
  const when = computed
    ? new Date(computed).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" })
    : null;
  /** Whole numbers as they are, part-keeps to one place: 0.5, not a rounded 0. */
  const num = (n: number) => {
    const v = Math.round(Number(n) * 10) / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const effectText = (r: Row) => {
    const l = lean(r);
    if (Math.abs(l) < 0.05) return <span className="text-mutedbrown">No change yet</span>;
    return l > 0 ? (
      <span className="font-semibold text-[#0f766e]">Moves up (+{l.toFixed(1)})</span>
    ) : (
      <span className="font-semibold text-[#b42318]">Moves down ({l.toFixed(1)})</span>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Pull</h1>
          <p className="max-w-[640px] text-[14px] text-mutedbrown">
            Which places people keep once Duro puts them in a plan, and which they swap for somewhere else.
            {when ? ` Worked out ${when}.` : ""}
          </p>
        </div>
        <RecomputePull />
      </div>

      {/* How it works, in three lines. */}
      <section className="card mt-5 p-5">
        <h2 className="adm-section-title">How it works</h2>
        <ol className="mt-3 grid gap-3 text-[14px] md:grid-cols-3">
          {[
            ["1", "Every time Duro puts a place in someone's plan, the app notes what they do with it."],
            ["2", "Saving or sharing the plan, or tapping Book or Get there, counts for the place. Swapping it out counts against."],
            [
              "3",
              `Every night, places people keep more than most move up a little in future plans, and places they swap out move down. Never by more than ${PULL.cap} points: less than one matching vibe.`,
            ],
          ].map(([n, t]) => (
            <li key={n} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fde8ef] text-[13px] font-bold text-[#a8214a]">{n}</span>
              <span className="text-cocoa">{t}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-[10px] bg-[#f1efec] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13.5px]">
            <span className="font-semibold text-ink">{live ? "Pull is changing plans now" : "Pull is only watching for now"}</span>
            <span className="tabular-nums text-mutedbrown">
              {Math.min(Math.round(total), PULL.minTotal)} of {PULL.minTotal} keeps or swaps needed
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5e1dc]">
            <div className="h-full rounded-full bg-[#c92c58]" style={{ width: `${Math.min(100, (total / PULL.minTotal) * 100)}%` }} />
          </div>
          {!live ? (
            <p className="mt-2 text-[12.5px] text-mutedbrown">
              No place moves until people have kept or swapped places {PULL.minTotal} times between them. Before that, one
              person&apos;s swaps would decide too much.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="adm-section-title">What people did · {period.heading.toLowerCase()}</h2>
          <PeriodPicker path="/admin/pull" current={period.key} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {KINDS.map(([k, label], i) => (
            <div key={k} className="adm-tile block">
              <div className="text-[12.5px] font-semibold text-mutedbrown">{label}</div>
              <div className="adm-num mt-1 !text-[24px] text-ink">{(kindCounts[i].count ?? 0).toLocaleString("en-GB")}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="adm-section-title">Places</h2>
        <p className="mt-1 max-w-[640px] text-[13px] text-mutedbrown">
          Every place anyone has done something with, the ones moving most first. A saved or shared plan is one keep;
          tapping Book or Get there is half a keep, and opening the menu or details a quarter, which is why some places
          have halves. Over the last 90 days, older days counting for less.
        </p>
        <PagedTable
          empty="Nothing yet. Press Recompute now once people have used the app."
          minWidth={560}
          head={
            <>
              <th>Place</th>
              <th>In plans</th>
              <th>Kept</th>
              <th>Swapped out</th>
              <th>In future plans</th>
            </>
          }
          rows={active.map((r) => (
            <tr key={r.venue_id}>
              <td>
                <Link href={`/admin/venues/${r.venue_id}`} className="font-semibold hover:underline">
                  {r.venues?.name ?? "?"}
                </Link>
                <div className="text-[12px] text-mutedbrown">{r.venues?.areas?.name ?? ""}</div>
              </td>
              <td className="tabular-nums">{Math.round(Number(r.shown))}</td>
              <td className="tabular-nums">{num(r.kept)}</td>
              <td className="tabular-nums">{num(r.swapped)}</td>
              <td>{effectText(r)}</td>
            </tr>
          ))}
        />
      </section>

      <section className="mt-8">
        <h2 className="adm-section-title">Latest activity</h2>
        <p className="mt-1 text-[13px] text-mutedbrown">Straight from the app, newest first. The phone column tells phones apart without saying whose.</p>
        <PagedTable
          empty="Nothing recorded yet."
          minWidth={520}
          head={
            <>
              <th>When</th>
              <th>What</th>
              <th>Place</th>
              <th>Phone</th>
            </>
          }
          rows={recent.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap tabular-nums text-mutedbrown">
                {new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className={r.kind === "swapped_away" ? "font-semibold text-[#b42318]" : r.kind === "saved" || r.kind === "shared" ? "font-semibold text-[#0f766e]" : ""}>
                {SAID[r.kind] ?? r.kind}
                {r.item ? <span className="font-normal text-mutedbrown"> · {r.item}</span> : null}
                {r.kind === "venue_viewed" && r.value != null ? <span className="font-normal text-mutedbrown"> · {Math.round(r.value / 1000)}s</span> : null}
              </td>
              <td>
                <Link href={`/admin/venues/${r.venue_id}`} className="hover:underline">
                  {r.venues?.name ?? "?"}
                </Link>
              </td>
              <td className="font-mono text-[12px] text-mutedbrown">{r.device_id.slice(0, 6)}</td>
            </tr>
          ))}
        />
      </section>
    </div>
  );
}
