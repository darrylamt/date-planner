import { NextResponse } from "next/server";
import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { allow, clientIp, rateKey } from "@/lib/rateLimit";
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

  const db = createServiceClient();
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
      who: who ? rateKey("trip:demand", who) : null,
      platform: said === "ios" || said === "android" ? said : device ? null : "web",
      app_version: req.headers.get("x-duro-version")?.slice(0, 32) || null,
    });
  } catch {
    /* never a lost trip over statistics; before 0102 the insert simply fails */
  }

  return NextResponse.json({ status: "ok", trip });
}
