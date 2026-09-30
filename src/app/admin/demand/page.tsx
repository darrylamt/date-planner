import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { haversineKm } from "@/lib/transport";

export const dynamic = "force-dynamic";

interface DemandRow {
  created_at: string;
  source: "areas" | "near" | "anywhere";
  area_ids: string[];
  cell_lat: number | null;
  cell_lng: number | null;
  occasion: string | null;
  budget_band: string | null;
  outcome: "ok" | "no_match";
  no_match_reason: string | null;
  weekday: number | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");
const tally = <T extends string>(items: (T | null)[]) => {
  const m = new Map<string, number>();
  for (const i of items) m.set(i ?? "unknown", (m.get(i ?? "unknown") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/**
 * Where people plan, against what we hold there.
 *
 * From plan_demand (0065): one anonymous row per plan request, no account and
 * no exact position. The one question it exists to answer is where to sign
 * venues next: an area with many requests, few venues and a high share of
 * "nothing fitted" is the next place to walk into.
 *
 * "Near me" requests are placed in the area whose middle is nearest their
 * rough square, so they count alongside people who chose that area by name.
 */
export default async function AdminDemandPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = Math.min(365, Math.max(1, Number(searchParams.days) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const supabase = await adminDataClient();

  let rows: DemandRow[] = [];
  let missing = false;
  try {
    rows = await fetchAllRows<DemandRow>((a, b) =>
      supabase
        .from("plan_demand")
        .select("created_at, source, area_ids, cell_lat, cell_lng, occasion, budget_band, outcome, no_match_reason, weekday")
        .gte("created_at", since)
        .range(a, b)
    );
  } catch {
    missing = true;
  }

  const [{ data: areas }, { data: venues }] = await Promise.all([
    supabase.from("areas").select("id, name"),
    supabase.from("venues").select("id, area_id, lat, lng").eq("is_active", true),
  ]);
  const areaName = new Map((areas ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));
  const vs = (venues ?? []) as { id: string; area_id: string; lat: number | null; lng: number | null }[];

  // The middle of each area, from its venues with a pin.
  const sums = new Map<string, { lat: number; lng: number; n: number }>();
  for (const v of vs) {
    if (v.lat == null || v.lng == null) continue;
    const s = sums.get(v.area_id) ?? { lat: 0, lng: 0, n: 0 };
    s.lat += Number(v.lat);
    s.lng += Number(v.lng);
    s.n++;
    sums.set(v.area_id, s);
  }
  const middles = [...sums.entries()].map(([id, s]) => ({ id, lat: s.lat / s.n, lng: s.lng / s.n }));
  const nearestArea = (lat: number, lng: number) =>
    middles.reduce<{ id: string; km: number } | null>((best, m) => {
      const km = haversineKm({ lat, lng }, m);
      return !best || km < best.km ? { id: m.id, km } : best;
    }, null)?.id ?? null;

  const venuesIn = new Map<string, number>();
  for (const v of vs) venuesIn.set(v.area_id, (venuesIn.get(v.area_id) ?? 0) + 1);

  type AreaStat = { asked: number; unmet: number; near: number };
  const byArea = new Map<string, AreaStat>();
  const bump = (id: string, row: DemandRow, near: boolean) => {
    const s = byArea.get(id) ?? { asked: 0, unmet: 0, near: 0 };
    s.asked++;
    if (row.outcome === "no_match") s.unmet++;
    if (near) s.near++;
    byArea.set(id, s);
  };
  for (const r of rows) {
    if (r.source === "areas") for (const id of r.area_ids) bump(id, r, false);
    if (r.source === "near" && r.cell_lat != null && r.cell_lng != null) {
      const id = nearestArea(Number(r.cell_lat), Number(r.cell_lng));
      if (id) bump(id, r, true);
    }
  }
  const areaRows = [...byArea.entries()]
    .map(([id, s]) => ({ id, name: areaName.get(id) ?? "?", ...s, held: venuesIn.get(id) ?? 0 }))
    // Most asked-for per venue held, then most unmet: where a new venue would matter most.
    .sort((a, b) => b.asked / Math.max(1, b.held) - a.asked / Math.max(1, a.held) || b.unmet - a.unmet);

  const total = rows.length;
  const unmet = rows.filter((r) => r.outcome === "no_match").length;
  const reasons = tally(rows.filter((r) => r.outcome === "no_match").map((r) => r.no_match_reason)).slice(0, 8);
  const occasions = tally(rows.map((r) => r.occasion)).slice(0, 8);
  const budgets = tally(rows.map((r) => r.budget_band));
  const weekdays = DAYS.map((d, i) => [d, rows.filter((r) => r.weekday === i).length] as const);

  // The map: venues in grey, demand as rings sized by requests.
  const pts = [...vs.filter((v) => v.lat != null && v.lng != null).map((v) => ({ lat: Number(v.lat), lng: Number(v.lng) })), ...middles];
  const minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat));
  const minLng = Math.min(...pts.map((p) => p.lng)), maxLng = Math.max(...pts.map((p) => p.lng));
  const W = 640, H = 420;
  const x = (lng: number) => 20 + ((lng - minLng) / Math.max(1e-6, maxLng - minLng)) * (W - 40);
  const y = (lat: number) => H - 20 - ((lat - minLat) / Math.max(1e-6, maxLat - minLat)) * (H - 40);
  const maxAsked = Math.max(1, ...areaRows.map((a) => a.asked));

  return (
    <div className="max-w-[1000px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold">Demand</h1>
        <div className="flex gap-2 text-[13px]">
          {[7, 30, 90].map((d) => (
            <a key={d} href={`/admin/demand?days=${d}`} className={`rounded-full px-3 py-1 font-semibold ${d === days ? "bg-ink text-white" : "bg-white ring-1 ring-black/10"}`}>
              {d} days
            </a>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[14px] text-mutedbrown">
        Every plan request, anonymously: no account, no exact location. The top of the table is where to sign venues next.
      </p>

      {missing ? (
        <div className="card mt-5 p-5 text-[14px]">
          Run migration <b>0065_plan_demand.sql</b> first. Requests are recorded from then on.
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="Plan requests" value={String(total)} />
            <Stat label="Nothing fitted" value={`${unmet} (${pct(unmet, total)})`} />
            <Stat label="Chose areas" value={pct(rows.filter((r) => r.source === "areas").length, total)} />
            <Stat label="Near me" value={pct(rows.filter((r) => r.source === "near").length, total)} />
          </div>

          <div className="card mt-5 overflow-x-auto p-4">
            <h2 className="mb-2 text-[16px] font-bold">By area</h2>
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Requests</th>
                  <th>Nothing fitted</th>
                  <th>Venues we hold</th>
                  <th>Requests per venue</th>
                </tr>
              </thead>
              <tbody>
                {areaRows.map((a) => (
                  <tr key={a.id}>
                    <td className="font-bold">{a.name}</td>
                    <td className="font-mono">
                      {a.asked}
                      {a.near ? <span className="text-mutedbrown"> ({a.near} near me)</span> : null}
                    </td>
                    <td className={`font-mono ${a.unmet ? "text-staletext" : ""}`}>
                      {a.unmet} ({pct(a.unmet, a.asked)})
                    </td>
                    <td className="font-mono">{a.held}</td>
                    <td className="font-mono">{(a.asked / Math.max(1, a.held)).toFixed(1)}</td>
                  </tr>
                ))}
                {!areaRows.length ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-mutedbrown">
                      No requests in this window yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="card mt-5 p-4">
            <h2 className="mb-2 text-[16px] font-bold">Map</h2>
            <p className="mb-2 text-[12px] text-mutedbrown">Grey: venues we hold. Rings: requests per area, larger is more, red when more than a third found nothing.</p>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-cream/50">
              {vs.filter((v) => v.lat != null && v.lng != null).map((v) => (
                <circle key={v.id} cx={x(Number(v.lng))} cy={y(Number(v.lat))} r={2.2} fill="#9a8f86" opacity={0.6} />
              ))}
              {areaRows.map((a) => {
                const m = middles.find((mm) => mm.id === a.id);
                if (!m) return null;
                const r = 6 + 22 * Math.sqrt(a.asked / maxAsked);
                const hot = a.unmet / Math.max(1, a.asked) > 1 / 3;
                return (
                  <g key={a.id}>
                    <circle cx={x(m.lng)} cy={y(m.lat)} r={r} fill={hot ? "#c0392b" : "#e8590c"} opacity={0.25} stroke={hot ? "#c0392b" : "#e8590c"} />
                    <text x={x(m.lng)} y={y(m.lat) - r - 3} textAnchor="middle" fontSize={11} fill="#3b2f2a">
                      {a.name} {a.asked}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <List title="Why nothing fitted" rows={reasons} total={unmet} />
            <List title="Occasions" rows={occasions} total={total} />
            <List title="Budgets" rows={budgets} total={total} />
            <List title="Days planned for" rows={weekdays.map(([d, n]) => [d, n] as [string, number])} total={total} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-mutedbrown">{label}</div>
      <div className="mt-1 font-display text-[22px] font-bold">{value}</div>
    </div>
  );
}

function List({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <div className="card p-4">
      <h2 className="mb-2 text-[16px] font-bold">{title}</h2>
      {rows.length ? (
        <ul className="grid gap-1.5 text-[13px]">
          {rows.map(([k, n]) => (
            <li key={k} className="flex items-center gap-3">
              <span className="w-[45%] truncate">{k.replace(/_/g, " ")}</span>
              <span className="h-2 flex-1 rounded bg-black/5">
                <span className="block h-2 rounded bg-flame" style={{ width: pct(n, Math.max(1, ...rows.map((r) => r[1]))) }} />
              </span>
              <span className="w-12 text-right font-mono">{n}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-mutedbrown">Nothing yet{total ? "" : " in this window"}.</p>
      )}
    </div>
  );
}
