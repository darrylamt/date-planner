import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { haversineKm } from "@/lib/transport";
import { DAY_TRIP_KM, missingFor, routesTo, type Destination, type IntercityRoute } from "@/lib/trips";

export const dynamic = "force-dynamic";

interface Point {
  lat: number | null;
  lng: number | null;
}
interface StayPoint extends Point {
  stay_rooms: { price_per_night_ghs: number | null; is_active: boolean }[];
}

/*
 * Where the research came from, and where to look for the rest. Each line
 * says what it is good for and what it is not, because half of these give
 * a figure that is easy to mistake for a current price.
 */
const SOURCES: { what: string; name: string; href: string | null; note: string }[] = [
  {
    what: "Bus fares",
    name: "VIP Jeoun's fare list, 8 April 2026 (Graphic Online)",
    href: "https://www.graphic.com.gh/news/general-news/vip-jeoun-transport-hikes-fares-effective-wednesday-cites-first-review-in-two-years.html",
    note: "Seeded. The article prints 24 of VIP's 42 executive routes and 18 of its 33 standard ones; the rest are on the notice at VIP's stations. Search \"VIP Jeoun new fares\" for a newer list.",
  },
  {
    what: "Bus fares",
    name: "Intercity STC",
    href: null,
    note: "No current list is published. STC said on 9 April 2026 that its fares were unchanged (Ghanaian Times) without giving them. Call a terminal or ask at the counter; older lists online are years out of date.",
  },
  {
    what: "Flights",
    name: "Africa World Airlines",
    href: "https://www.flyafricaworld.com/",
    note: "Seeded. Its home page shows a \"from\" fare and flights a day for Kumasi, Takoradi and Tamale. Re-read it now and then; the fare changes by date.",
  },
  {
    what: "Flights",
    name: "PassionAir",
    href: "https://flypassionair.com/",
    note: "Seeded with routes only (Kumasi, Tamale, Takoradi, Wa, Sunyani). The site turns automated readers away, so fares have to be looked up by hand.",
  },
  {
    what: "Photos",
    name: "Wikimedia Commons",
    href: "https://commons.wikimedia.org/w/index.php?search=Ghana+waterfall&title=Special:MediaSearch&type=image",
    note: "Seeded. Free to use with the author and licence shown beside the photo (CC BY, CC BY-SA, CC0). Copy the file page's link into Photo source.",
  },
  {
    what: "Places",
    name: "Wikipedia and OpenStreetMap",
    href: "https://www.openstreetmap.org/",
    note: "Seeded coordinates. OpenStreetMap places what Wikipedia lacks (Wli falls, Tafi Atome); its data is ODbL, credited like the trotro map.",
  },
  {
    what: "Road distances",
    name: "OSRM routing",
    href: "https://project-osrm.org/",
    note: "Seeded the km from Accra. Its drive times ignore traffic and stops, so they were not used for journey times.",
  },
  {
    what: "Places to stay",
    name: "Discover venues (Google)",
    href: "/admin/discover",
    note: "Search \"hotels in Ho\" and add them as stays. Rates come from a call, WhatsApp or their own site, never from a booking site's teaser price.",
  },
  {
    what: "Things to do",
    name: "Ghana Tourism Authority",
    href: "https://visitghana.com/",
    note: "Attractions by region. Entry fees for castles, parks and falls change and the ones online are old: ring and record the date.",
  },
];

/**
 * Trips (0101): every destination with what it has and what it still needs
 * before a trip there can be planned. Ready means a stay with rates, a way
 * there, and enough places nearby to fill the days.
 */
export default async function AdminTripsPage() {
  const db = await adminDataClient(["stays"]);
  const [dest, routes] = await Promise.all([
    db.from("destinations").select("*").order("sort").order("name"),
    db.from("intercity_routes").select("*").eq("is_active", true),
  ]);

  if (dest.error || routes.error) {
    return (
      <div className="max-w-[900px]">
        <h1>Trips</h1>
        <div className="card mt-5 p-5 text-[14px]">
          <b>Run migration 0101_trips.sql first.</b>
          <div className="mt-2 text-mutedbrown">
            It makes the tables and fills them with the research: 26 destinations and 50 ways to get there. Paste the file into the
            Supabase SQL editor, run it, and reload.
          </div>
        </div>
      </div>
    );
  }

  // Where people asked to go in the last 30 days (0102); none before it has run.
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [venues, stays, demand] = await Promise.all([
    fetchAllRows<Point>((a, b) => db.from("venues").select("lat, lng").eq("is_active", true).neq("type", "stay").order("id").range(a, b)),
    fetchAllRows<StayPoint>((a, b) =>
      db.from("venues").select("lat, lng, stay_rooms(price_per_night_ghs, is_active)").eq("type", "stay").eq("is_active", true).order("id").range(a, b)
    ),
    db.from("trip_demand").select("destination").gte("created_at", since).limit(5000),
  ]);
  const asks = new Map<string, number>();
  for (const r of (demand.data ?? []) as { destination: string }[]) asks.set(r.destination, (asks.get(r.destination) ?? 0) + 1);

  const destinations = (dest.data ?? []) as Destination[];
  const allRoutes = (routes.data ?? []) as IntercityRoute[];
  const near = (d: Destination, p: Point) =>
    d.lat != null && d.lng != null && p.lat != null && p.lng != null && haversineKm({ lat: d.lat, lng: d.lng }, { lat: Number(p.lat), lng: Number(p.lng) }) <= Number(d.radius_km);

  const rows = destinations.map((d) => {
    const here = stays.filter((s) => near(d, s));
    const priced = here.filter((s) => s.stay_rooms.some((r) => r.is_active && r.price_per_night_ghs != null)).length;
    const ways = routesTo(d, allRoutes);
    const c = { stays: here.length, pricedStays: priced, routes: ways.length, pricedRoutes: ways.filter((r) => r.fare_min_ghs != null || r.fare_max_ghs != null).length, venues: venues.filter((v) => near(d, v)).length };
    return { d, c, missing: missingFor(c) };
  });
  // A destination not ready on its own is planned as a day trip from the nearest ready one within reach (trip.ts).
  const readyRows = rows.filter((r) => r.d.is_active && !r.missing.length);
  const dayTripFrom = new Map<string, { name: string; km: number }>();
  for (const r of rows) {
    if (!r.missing.length || r.d.lat == null || r.d.lng == null) continue;
    const at = { lat: Number(r.d.lat), lng: Number(r.d.lng) };
    const b = readyRows
      .filter((x) => x.d.slug !== r.d.slug && x.d.lat != null && x.d.lng != null)
      .map((x) => ({ name: x.d.name, km: haversineKm(at, { lat: Number(x.d.lat), lng: Number(x.d.lng) }) }))
      .filter((x) => x.km <= DAY_TRIP_KM)
      .sort((a, b) => a.km - b.km)[0];
    if (b) dayTripFrom.set(r.d.slug, { name: b.name, km: Math.round(b.km) });
  }
  const ready = readyRows.length;
  const priced = allRoutes.filter((r) => r.fare_min_ghs != null || r.fare_max_ghs != null).length;

  return (
    <div className="max-w-[1000px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Trips</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/trips/routes" className="btn2 btnsm">
            Ways to get there
          </Link>
          <Link href="/admin/stays" className="btn2 btnsm">
            Stays
          </Link>
          <Link href="/admin/trips/new" className="btn btnsm">
            Add a destination
          </Link>
        </div>
      </div>
      <p className="mt-1 max-w-[720px] text-[14px] text-mutedbrown">
        {destinations.length} destinations, {ready} ready for a trip, {dayTripFrom.size} more as a day trip from one of those. {allRoutes.length} ways to get there, {priced} with a fare. Ready
        means a stay with rates, a way there, and at least six places within the destination&apos;s radius. Not in the app until
        Trips is built.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {rows.map(({ d, c, missing }) => (
          <Link key={d.slug} href={`/admin/trips/${d.slug}`} className={`card flex gap-3 p-3 hover:bg-cream/60 ${d.is_active ? "" : "opacity-60"}`}>
            {d.hero_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.hero_image} alt="" loading="lazy" className="h-[84px] w-[112px] shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-[84px] w-[112px] shrink-0 items-center justify-center rounded-lg bg-cream text-[12px] text-mutedbrown">No photo</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{d.name}</span>
                {missing.length ? (
                  dayTripFrom.get(d.slug) ? <span className="badge shrink-0">day trip</span> : null
                ) : (
                  <span className="badge b-ok shrink-0">ready</span>
                )}
              </span>
              <span className="block text-[12.5px] text-mutedbrown">
                {d.region}
                {d.gateway_town !== (d.town ?? d.name) ? ` · via ${d.gateway_town}` : ""}
                {d.road_km_from_accra ? ` · ${d.road_km_from_accra} km from Accra` : ""}
                {d.is_active ? "" : " · hidden"}
              </span>
              <span className="mt-1 block text-[12.5px]">
                {c.pricedStays}/{c.stays} stays priced · {c.pricedRoutes}/{c.routes} ways priced · {c.venues} places
                {asks.get(d.slug) ? <b> · {asks.get(d.slug)} asked in 30 days</b> : null}
              </span>
              {missing.length && dayTripFrom.get(d.slug) ? (
                <span className="mt-0.5 block text-[12.5px] text-mutedbrown">
                  Planned as a day trip from {dayTripFrom.get(d.slug)!.name}, {dayTripFrom.get(d.slug)!.km} km. To stay there it needs {missing.join(", ")}.
                </span>
              ) : missing.length ? (
                <span className="mt-0.5 block text-[12.5px] text-staletext">Needs {missing.join(", ")}</span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="adm-section-title">Where the data comes from, and where to find more</h2>
        <div className="card mt-2 divide-y divide-black/5">
          {SOURCES.map((s) => (
            <div key={s.name} className="grid gap-1 p-4 md:grid-cols-[140px_1fr]">
              <span className="text-[12.5px] font-semibold text-mutedbrown">{s.what}</span>
              <span className="text-[14px]">
                {s.href ? (
                  <a href={s.href} target={s.href.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="font-semibold text-flame">
                    {s.name}
                  </a>
                ) : (
                  <b>{s.name}</b>
                )}
                <span className="block text-[13px] text-mutedbrown">{s.note}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
