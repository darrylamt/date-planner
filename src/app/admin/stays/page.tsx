import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { STAY_KINDS } from "@/lib/stays";
import { ghs } from "@/lib/format";

export const dynamic = "force-dynamic";

interface StayRow {
  id: string;
  name: string;
  is_active: boolean;
  image_url: string | null;
  stay_details: { kind: string; region: string; town: string | null; rates_checked_on: string | null } | null;
  stay_rooms: { price_per_night_ghs: number | null; is_active: boolean }[];
}

/**
 * Places to stay (0099), for Trips within Ghana when it is built: where each
 * one is, its rooms and what a night costs. Region by region, so what still
 * needs filling shows. The stays team's desk, and the admins'.
 */
export default async function AdminStaysPage() {
  const db = await adminDataClient(["stays"]);
  const { data, error } = await db
    .from("venues")
    .select("id, name, is_active, image_url, stay_details(kind, region, town, rates_checked_on), stay_rooms(price_per_night_ghs, is_active)")
    .eq("type", "stay")
    .order("name");

  if (error) {
    return (
      <div className="max-w-[900px]">
        <h1>Stays</h1>
        <div className="card mt-5 p-5 text-[14px]">
          Run migration <b>0099_stays.sql</b> first. Then places to stay can be added here.
        </div>
      </div>
    );
  }

  const stays = (data ?? []) as unknown as StayRow[];
  const byRegion = new Map<string, StayRow[]>();
  for (const s of stays) {
    const r = s.stay_details?.region ?? "No region yet";
    byRegion.set(r, [...(byRegion.get(r) ?? []), s]);
  }
  const kind = (id?: string) => STAY_KINDS.find((k) => k.id === id)?.label ?? "Stay";
  const rates = (s: StayRow) => {
    const p = s.stay_rooms.filter((r) => r.is_active && r.price_per_night_ghs != null).map((r) => Number(r.price_per_night_ghs));
    if (!p.length) return "No rates yet";
    const lo = Math.min(...p), hi = Math.max(...p);
    return lo === hi ? `${ghs(lo)} a night` : `${ghs(lo)} to ${ghs(hi)} a night`;
  };

  return (
    <div className="max-w-[900px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Stays</h1>
        <Link href="/admin/stays/new" className="btn btnsm">
          Add a stay
        </Link>
      </div>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Hotels, guesthouses and lodges across Ghana, with their rooms and what a night costs, ready for Trips. Not shown in the
        app until Trips is built.
      </p>

      {stays.length === 0 ? (
        <div className="card mt-5 p-5 text-[14px]">No stays yet. Add the first one.</div>
      ) : (
        [...byRegion.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([region, rows]) => (
            <section key={region} className="mt-6">
              <h2 className="adm-section-title">
                {region} · {rows.length}
              </h2>
              <div className="mt-2 grid gap-2">
                {rows.map((s) => (
                  <Link key={s.id} href={`/admin/stays/${s.id}`} className="card flex items-center justify-between gap-3 p-4 hover:bg-cream/60">
                    <span className="min-w-0">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="block text-[13px] text-mutedbrown">
                        {kind(s.stay_details?.kind)}
                        {s.stay_details?.town ? ` · ${s.stay_details.town}` : ""} · {s.stay_rooms.length} room types · {rates(s)}
                        {s.is_active ? "" : " · closed"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] text-mutedbrown">
                      {s.stay_details?.rates_checked_on ? `Checked ${s.stay_details.rates_checked_on}` : "Rates not checked"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
