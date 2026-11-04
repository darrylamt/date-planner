import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { DestinationForm, type DestinationDraft } from "@/components/admin/DestinationForm";
import { routesTo, tripFareText, type Destination, type IntercityRoute } from "@/lib/trips";

export const dynamic = "force-dynamic";

/** One destination, or "new" for a blank one (0101), with the ways there under it. */
export default async function AdminDestinationPage({ params }: { params: { slug: string } }) {
  const db = await adminDataClient(["stays"]);
  const str = (x: unknown) => (x == null ? "" : String(x));

  let initial: DestinationDraft = {
    existing: false, slug: "", name: "", region: "", town: "", gateway_town: "", last_leg: "", lat: "", lng: "",
    radius_km: "10", road_km_from_accra: "", blurb: "", highlights: "", best_time: "", hero_image: "", image_credit: "",
    image_license: "", image_source: "", wiki_url: "", notes: "", is_active: true, sort: "500",
  };
  let ways: IntercityRoute[] = [];

  if (params.slug !== "new") {
    const [{ data, error }, routes] = await Promise.all([
      db.from("destinations").select("*").eq("slug", params.slug).maybeSingle(),
      db.from("intercity_routes").select("*").order("from_town").order("operator"),
    ]);
    if (error) {
      return (
        <div className="card max-w-[720px] p-5 text-[14px]">
          Run migration <b>0101_trips.sql</b> first.
        </div>
      );
    }
    if (!data) notFound();
    const d = data as Destination;
    initial = {
      existing: true,
      slug: d.slug,
      name: d.name,
      region: d.region,
      town: str(d.town),
      gateway_town: d.gateway_town,
      last_leg: str(d.last_leg),
      lat: str(d.lat),
      lng: str(d.lng),
      radius_km: str(d.radius_km),
      road_km_from_accra: str(d.road_km_from_accra),
      blurb: str(d.blurb),
      highlights: (d.highlights ?? []).join("\n"),
      best_time: str(d.best_time),
      hero_image: str(d.hero_image),
      image_credit: str(d.image_credit),
      image_license: str(d.image_license),
      image_source: str(d.image_source),
      wiki_url: str(d.wiki_url),
      notes: str(d.notes),
      is_active: d.is_active,
      sort: str(d.sort),
    };
    ways = routesTo(d, (routes.data ?? []) as IntercityRoute[]);
  }

  return (
    <div className="grid gap-6">
      <DestinationForm initial={initial} />
      {initial.existing ? (
        <section className="max-w-[900px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="adm-section-title">Ways to get to {initial.gateway_town} · {ways.length}</h2>
            <span className="flex gap-4">
              <Link href={`/admin/stays/find?d=${initial.slug}`} className="text-[13px] font-semibold text-flame">
                Find stays near here →
              </Link>
              <Link href={`/admin/trips/routes?town=${encodeURIComponent(initial.gateway_town)}`} className="text-[13px] font-semibold text-flame">
                Add or change them →
              </Link>
            </span>
          </div>
          <div className="card mt-2 divide-y divide-black/5">
            {ways.map((r) => (
              <div key={r.id} className={`flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-[14px] ${r.is_active ? "" : "opacity-50"}`}>
                <span>
                  <b>{r.operator}</b>
                  {r.service ? ` ${r.service}` : ""} · {r.from_town} → {r.to_town}
                  {r.departures ? <span className="text-mutedbrown"> · {r.departures}</span> : null}
                </span>
                <span className="font-mono text-[13px]">{tripFareText(r.fare_min_ghs, r.fare_max_ghs) ?? <span className="text-staletext">fare unknown</span>}</span>
              </div>
            ))}
            {!ways.length ? <div className="p-4 text-[14px] text-mutedbrown">None yet. A trip here has no way to get there.</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
