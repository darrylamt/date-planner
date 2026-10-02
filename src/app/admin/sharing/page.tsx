import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";

export const dynamic = "force-dynamic";

interface ShareRow {
  created_at: string;
  kind: "view" | "plan_your_own" | "app_store";
  page: "shared_plan" | "get" | "home" | "name_poll";
  plan_slug: string | null;
  occasion: string | null;
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");

/**
 * Whether shared plans bring anybody in.
 *
 * From share_events (0070): anonymous, one row per step. A shared plan opened
 * in a browser (link previews do not count, the page counts itself once it
 * runs), "Plan your own" tapped, the App Store badge tapped, on the shared
 * page or on /get after arriving from one. What happens inside the App Store
 * is Apple's to count, under the campaign the links carry.
 */
export default async function AdminSharingPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = Math.min(365, Math.max(1, Number(searchParams.days) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const supabase = await adminDataClient();

  let rows: ShareRow[] = [];
  let missing = false;
  try {
    rows = await fetchAllRows<ShareRow>((a, b) =>
      supabase
        .from("share_events")
        .select("created_at, kind, page, plan_slug, occasion")
        .gte("created_at", since)
        .range(a, b)
    );
  } catch {
    missing = true;
  }

  const opens = rows.filter((r) => r.kind === "view" && r.page === "shared_plan");
  const plansOpened = new Set(opens.map((r) => r.plan_slug).filter(Boolean)).size;
  const planYourOwn = rows.filter((r) => r.kind === "plan_your_own");
  // From a shared plan: the badge on the plan itself, or /get reached by "Plan your own".
  const storeFromShares = rows.filter((r) => r.kind === "app_store" && (r.page === "shared_plan" || (r.page === "get" && r.plan_slug)));
  const storeElsewhere = rows.filter((r) => r.kind === "app_store" && !storeFromShares.includes(r));

  const byOccasion = new Map<string, { plans: Set<string>; opens: number; pyo: number; store: number }>();
  const row = (o: string | null) => {
    const key = (o ?? "unknown").replace(/_/g, " ");
    const s = byOccasion.get(key) ?? { plans: new Set<string>(), opens: 0, pyo: 0, store: 0 };
    byOccasion.set(key, s);
    return s;
  };
  for (const r of opens) {
    const s = row(r.occasion);
    s.opens++;
    if (r.plan_slug) s.plans.add(r.plan_slug);
  }
  for (const r of planYourOwn) row(r.occasion).pyo++;
  for (const r of storeFromShares) row(r.occasion).store++;
  const occasions = [...byOccasion.entries()].sort((a, b) => b[1].opens - a[1].opens);

  return (
    <div className="max-w-[1000px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold">Sharing</h1>
        <div className="flex gap-2 text-[13px]">
          {[7, 30, 90].map((d) => (
            <a key={d} href={`/admin/sharing?days=${d}`} className={`rounded-full px-3 py-1 font-semibold ${d === days ? "bg-ink text-white" : "bg-white ring-1 ring-black/10"}`}>
              {d} days
            </a>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[14px] text-mutedbrown">
        What a shared plan leads to, anonymously: no account, no address, nothing stored on the visitor&apos;s phone.
      </p>

      {missing ? (
        <div className="card mt-5 p-5 text-[14px]">
          Run migration <b>0070_share_events.sql</b> first. Shares are counted from then on.
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Shared plans opened" value={String(plansOpened)} note={`${opens.length} opens in all`} />
            <Stat label="Plan your own" value={String(planYourOwn.length)} note={`${pct(planYourOwn.length, opens.length)} of opens`} />
            <Stat label="To the App Store" value={String(storeFromShares.length)} note={`${pct(storeFromShares.length, opens.length)} of opens`} />
            <Stat label="App Store, other pages" value={String(storeElsewhere.length)} note="home, /get, the poll" />
          </div>

          <div className="card mt-5 overflow-x-auto p-4">
            <h2 className="mb-2 text-[16px] font-bold">By occasion</h2>
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Occasion</th>
                  <th>Plans opened</th>
                  <th>Opens</th>
                  <th>Plan your own</th>
                  <th>To the App Store</th>
                </tr>
              </thead>
              <tbody>
                {occasions.map(([name, s]) => (
                  <tr key={name}>
                    <td className="font-bold capitalize">{name}</td>
                    <td className="font-mono">{s.plans.size}</td>
                    <td className="font-mono">{s.opens}</td>
                    <td className="font-mono">
                      {s.pyo} <span className="text-mutedbrown">({pct(s.pyo, s.opens)})</span>
                    </td>
                    <td className="font-mono">
                      {s.store} <span className="text-mutedbrown">({pct(s.store, s.opens)})</span>
                    </td>
                  </tr>
                ))}
                {!occasions.length ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-mutedbrown">
                      No shared plans opened in this window yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="card mt-5 p-4 text-[13px]">
            <h2 className="text-[16px] font-bold">Downloads</h2>
            <p className="mt-1 text-mutedbrown">
              Apple counts the installs, not us. Every App Store link on the site carries a campaign:{" "}
              <b>shared_plan</b> from a shared plan, <b>get_page</b> from the Get the app page, and <b>name_poll</b> from
              the poll. See them in App Store Connect under App Analytics, Acquisition, Campaigns.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-mutedbrown">{label}</div>
      <div className="mt-1 font-display text-[22px] font-bold">{value}</div>
      <div className="text-[12px] text-mutedbrown">{note}</div>
    </div>
  );
}
