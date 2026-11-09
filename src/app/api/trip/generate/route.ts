import { NextResponse } from "next/server";
import { createCatalogClient, createServiceClient, getCaller } from "@/lib/supabase/server";
import { allow, clientIp, rateKey } from "@/lib/rateLimit";
import { isProUser } from "@/lib/entitlements";
import { buildTrip, tripInputsSchema, UnknownDestination, type Trip, type TripResponse } from "@/lib/trip";

/**
 * Build a trip (src/lib/trip.ts): the ways there, stays, each day planned,
 * and what it comes to, with what we could not do said in `gaps`.
 *
 * Read as the server, because stays and the trip tables have no public read
 * (0099, 0101). Every trip asked for is noted in trip_demand (0102), so the
 * admin sees where people want to go and what was missing; a failure there
 * never costs anybody their trip.
 */
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse<TripResponse>> {
  const parsed = tripInputsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Invalid trip." }, { status: 400 });
  const inputs = parsed.data;

  const device = req.headers.get("x-duro-device");
  const caller = req.headers.get("authorization") ? await getCaller(req).catch(() => null) : null;
  const who = caller && !caller.anonymous ? `u:${caller.id}` : device && /^[A-Za-z0-9_-]{6,64}$/.test(device) ? `d:${device}` : null;

  // A ceiling like /api/generate's (0098): a trip is several plans' worth of reading.
  const ip = clientIp(req);
  const ok = (!who || (await allow(rateKey("trip:who", who), 3600, 20))) && (!ip || (await allow(rateKey("trip:ip", ip), 3600, 120)));
  if (!ok) {
    return NextResponse.json({ status: "error", message: "That's a lot of trips in a short time. Give it a few minutes, then try again." }, { status: 429 });
  }

  const db = createCatalogClient(true);

  /*
   * One trip a month free; Pro plans any number and changes them (owner,
   * 4 Nov 2026: "they can only plan 1 free trip per month ... cant edit
   * unless pro"). Trips are not saved, so the result screen builds again
   * whenever it opens: the same trip opened again is never refused, and any
   * change to it is a new trip. Counted from trip_demand by the same keyed
   * hash it already keeps, this calendar month, only trips that planned
   * something. Without an account or a phone id there is nothing to count by.
   */
  const demandKey = who ? rateKey("trip:demand", who) : null;
  if (demandKey && !(caller && !caller.anonymous && (await isProUser(caller.id).catch(() => false)))) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { data: mine } = await createServiceClient()
      .from("trip_demand")
      .select("destination, arrive, nights, party_size, comfort, travel, parts_planned")
      .eq("who", demandKey)
      .gte("created_at", monthStart)
      .gt("parts_planned", 0);
    const rows = (mine ?? []) as { destination: string; arrive: string; nights: number; party_size: number; comfort: string; travel: string }[];
    const same = rows.some(
      (r) => r.destination === inputs.to && r.arrive === inputs.arrive && r.nights === inputs.nights && r.party_size === inputs.partySize && r.comfort === inputs.comfort && r.travel === inputs.travel
    );
    if (rows.length && !same) {
      return NextResponse.json({
        status: "limit",
        message: "Your free trip this month is planned. With Pro you can plan as many trips as you like, and change them whenever you want.",
      });
    }
  }

  let trip: Trip;
  try {
    trip = await buildTrip(db, inputs);
  } catch (e) {
    if (e instanceof UnknownDestination) return NextResponse.json({ status: "error", message: "We don't know that place yet." }, { status: 404 });
    console.error("trip failed", inputs.to, e);
    return NextResponse.json({ status: "error", message: "We couldn't build that trip just now. Try again in a moment." }, { status: 500 });
  }

  try {
    const said = req.headers.get("x-duro-platform");
    const parts = trip.days.flatMap((d) => d.parts);
    await db.from("trip_demand").insert({
      destination: inputs.to,
      from_town: inputs.from,
      arrive: inputs.arrive,
      nights: inputs.nights,
      party_size: inputs.partySize,
      comfort: inputs.comfort,
      travel: inputs.travel,
      ready: trip.ready,
      gaps: trip.gaps,
      parts_planned: parts.filter((p) => p.itinerary).length,
      parts_total: parts.length,
      who: demandKey,
      platform: said === "ios" || said === "android" ? said : device ? null : "web",
      app_version: req.headers.get("x-duro-version")?.slice(0, 32) || null,
    });
  } catch {
    /* never a lost trip over statistics; before 0102 the insert simply fails */
  }

  return NextResponse.json({ status: "ok", trip });
}
