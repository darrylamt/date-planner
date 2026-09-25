import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { z } from "zod";
import { loadNetwork } from "@/lib/journeyNetwork";
import { planJourney, stopLabel, type NetLine, type NetStop, type Step } from "@/lib/journey";

/**
 * Door-to-door options between two places.   POST /api/transit/plan
 *
 * Read with the public anon key and no cookies, on purpose: the network is
 * cached for every caller, so it must be built from what a signed-out visitor
 * may see, never from an admin's session that can read hidden lines.
 */
export const dynamic = "force-dynamic";

const point = z.union([
  z.object({ venueId: z.string().uuid() }),
  z.object({ stationId: z.string().uuid() }),
  z.object({ lat: z.number().min(4).max(12), lng: z.number().min(-4).max(2), label: z.string().max(80).optional() }),
]);
const body = z.object({ from: point, to: point });

const anon = () =>
  createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

type Resolved = { lat: number; lng: number; label: string; venueId?: string };

async function resolve(db: ReturnType<typeof anon>, p: z.infer<typeof point>): Promise<Resolved | null> {
  if ("venueId" in p) {
    const { data } = await db.from("venues").select("id, name, lat, lng").eq("id", p.venueId).maybeSingle();
    if (!data || data.lat == null || data.lng == null) return null;
    return { lat: Number(data.lat), lng: Number(data.lng), label: data.name as string, venueId: data.id as string };
  }
  if ("stationId" in p) {
    const { data } = await db.from("trotro_stations").select("name, lat, lng").eq("id", p.stationId).maybeSingle();
    if (!data || data.lat == null || data.lng == null) return null;
    return { lat: Number(data.lat), lng: Number(data.lng), label: data.name as string };
  }
  return { lat: p.lat, lng: p.lng, label: p.label ?? "Where you are" };
}

/** What the page needs from a line, without its four dozen stops. */
const lineOut = (l: NetLine) => ({
  id: l.id,
  name: l.name,
  headsign: l.headsign,
  headwayMins: l.headwayMins,
  status: l.status,
  source: l.source,
  calledAs: l.calledAs,
  fareMin: l.fareMin,
  fareMax: l.fareMax,
  notes: l.notes,
  checkedOn: l.checkedOn,
});
const stopOut = (s: NetStop) => ({ id: s.id, name: s.name, label: stopLabel(s), lat: s.lat, lng: s.lng });
const stepOut = (s: Step) =>
  s.kind === "ride" ? { ...s, line: lineOut(s.line), board: stopOut(s.board), alight: stopOut(s.alight) } : s;

export async function POST(req: Request) {
  let input: z.infer<typeof body>;
  try {
    input = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Choose where you are starting and where you are going." }, { status: 400 });
  }

  const db = anon();
  const [from, to] = await Promise.all([resolve(db, input.from), resolve(db, input.to)]);
  if (!from || !to) {
    return NextResponse.json(
      { error: "One of those places has no map pin, so we cannot work out the way there yet." },
      { status: 422 }
    );
  }

  let net;
  try {
    net = await loadNetwork(db);
  } catch (e) {
    console.error("transit network load failed", e);
    return NextResponse.json({ error: "The route map is not set up yet." }, { status: 503 });
  }

  const options = planJourney(net, from, to);
  const access = to.venueId
    ? (await db.from("venue_access").select("*").eq("venue_id", to.venueId).maybeSingle()).data
    : null;

  return NextResponse.json({
    from,
    to,
    access,
    options: options.map((o) => ({ ...o, steps: o.steps.map(stepOut) })),
  });
}
