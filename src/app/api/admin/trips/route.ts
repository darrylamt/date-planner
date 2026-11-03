import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/adminAuth";
import { GHANA_REGIONS } from "@/lib/stays";
import { TRAVEL_MODE_IDS } from "@/lib/trips";

/**
 * Trips (0101), for the admin and the stays team.
 *
 *   destination:   a destination, new or changed.
 *   route:         a way between two towns, new or changed.
 *   route_active:  hide or show a route.
 *   route_delete:  remove one entered by mistake.
 *
 * The writes run as the service role, so a staff login's are logged by hand
 * (staff_edits), as /api/admin/stays does.
 */
const text = (max: number) => z.string().trim().max(max).nullable();
const town = z.string().trim().min(2).max(80);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("destination"),
    // The slug it had, when changing one; the slug itself never changes.
    existing: z.boolean(),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
    name: z.string().trim().min(2).max(80),
    region: z.enum(GHANA_REGIONS),
    town: text(80),
    gateway_town: town,
    last_leg: text(200),
    lat: z.number().min(4).max(12).nullable(),
    lng: z.number().min(-4).max(2).nullable(),
    radius_km: z.number().min(1).max(80),
    road_km_from_accra: z.number().int().min(0).max(1500).nullable(),
    blurb: text(300),
    highlights: z.array(z.string().trim().min(1).max(80)).max(12),
    best_time: text(200),
    hero_image: text(1000),
    image_credit: text(200),
    image_license: text(60),
    image_source: text(1000),
    wiki_url: text(600),
    notes: text(2000),
    is_active: z.boolean(),
    sort: z.number().int().min(-1000).max(10000),
  }),
  z.object({
    action: z.literal("route"),
    id: z.string().uuid().nullable(),
    from_town: town,
    to_town: town,
    mode: z.enum(TRAVEL_MODE_IDS),
    operator: z.string().trim().min(2).max(80),
    service: z.string().trim().max(60),
    both_ways: z.boolean(),
    from_station: text(120),
    to_station: text(120),
    departures: text(200),
    duration_mins: z.number().int().min(5).max(1800).nullable(),
    fare_min_ghs: z.number().min(0).max(100_000).nullable(),
    fare_max_ghs: z.number().min(0).max(100_000).nullable(),
    book_url: text(600),
    book_phone: text(40),
    source_url: text(600),
    notes: text(500),
    checked_on: day,
  }),
  z.object({ action: z.literal("route_active"), id: z.string().uuid(), is_active: z.boolean() }),
  z.object({ action: z.literal("route_delete"), id: z.string().uuid() }),
]);

export async function POST(req: Request) {
  const gate = await requireStaff(["stays"]);
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const body = parsed.data;
  const db = gate.supabase;
  const now = new Date().toISOString();
  const missing = (m?: string) => (/relation .* does not exist|Could not find the table/.test(m ?? "") ? "Run migration 0101_trips.sql first." : m);

  const log = async (table: string, rowId: string, action: "insert" | "update" | "delete", changes: Record<string, unknown>) => {
    if (gate.isAdmin) return;
    await db.from("staff_edits").insert({ user_id: gate.userId, table_name: table, row_id: rowId, action, changes });
  };

  if (body.action === "destination") {
    const { action: _a, existing, ...row } = body;
    void _a;
    const write = { ...row, highlights: [...new Set(row.highlights)], updated_by: gate.userId, updated_at: now };
    const { error } = existing
      ? await db.from("destinations").update(write).eq("slug", row.slug)
      : await db.from("destinations").insert(write);
    if (error) {
      const taken = /duplicate key/.test(error.message);
      return NextResponse.json({ error: taken ? `There is already a destination called "${row.slug}".` : missing(error.message) }, { status: taken ? 409 : 500 });
    }
    await log("destinations", row.slug, existing ? "update" : "insert", { name: row.name, region: row.region, gateway_town: row.gateway_town });
    return NextResponse.json({ ok: true, slug: row.slug });
  }

  if (body.action === "route") {
    const { action: _a, id, ...row } = body;
    void _a;
    if (row.from_town.toLowerCase() === row.to_town.toLowerCase()) {
      return NextResponse.json({ error: "From and to are the same town." }, { status: 422 });
    }
    if (row.fare_min_ghs != null && row.fare_max_ghs != null && row.fare_max_ghs < row.fare_min_ghs) {
      return NextResponse.json({ error: "The highest fare is below the lowest." }, { status: 422 });
    }
    const write = { ...row, updated_by: gate.userId, updated_at: now };
    const res = id
      ? await db.from("intercity_routes").update(write).eq("id", id).select("id").single()
      : await db.from("intercity_routes").insert(write).select("id").single();
    if (res.error || !res.data) {
      const taken = /duplicate key/.test(res.error?.message ?? "");
      return NextResponse.json(
        { error: taken ? "That operator and service between those towns is already in. Edit it instead." : (missing(res.error?.message) ?? "Could not save.") },
        { status: taken ? 409 : 500 }
      );
    }
    const rowId = (res.data as { id: string }).id;
    await log("intercity_routes", rowId, id ? "update" : "insert", { from: row.from_town, to: row.to_town, operator: row.operator, fare_min: row.fare_min_ghs, fare_max: row.fare_max_ghs });
    return NextResponse.json({ ok: true, id: rowId });
  }

  if (body.action === "route_active") {
    const { error } = await db.from("intercity_routes").update({ is_active: body.is_active, updated_at: now }).eq("id", body.id);
    if (error) return NextResponse.json({ error: missing(error.message) }, { status: 500 });
    await log("intercity_routes", body.id, "update", { is_active: body.is_active });
    return NextResponse.json({ ok: true });
  }

  const { data: gone, error } = await db.from("intercity_routes").delete().eq("id", body.id).select("from_town, to_town, operator, service").maybeSingle();
  if (error) return NextResponse.json({ error: missing(error.message) }, { status: 500 });
  await log("intercity_routes", body.id, "delete", (gone ?? {}) as Record<string, unknown>);
  return NextResponse.json({ ok: true });
}
