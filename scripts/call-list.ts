/**
 * Who to ring for the prices no website publishes (13 Nov 2026): stays near
 * a Trips destination with no room rates, and sights there with no entry
 * fee, plus the bus companies. Writes a CSV with blank answer columns.
 *
 *   npx tsx --env-file=.env.local scripts/call-list.ts research/call-list.csv
 *
 * Numbers waiting for approval (phone_pending) are included for the owner's
 * own calls and marked; they are not published by this.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { fetchAllRows } from "../src/lib/fetchAll";
import { haversineKm } from "../src/lib/transport";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const out = process.argv[2] ?? "research/call-list.csv";
const csv = (s: unknown) => (s == null ? "" : /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
/** Destinations a trip cannot finish without, first. */
const FIRST = new Set(["mole", "larabanga", "kintampo", "wa", "ada", "kakum", "nzulezo", "paga", "wli", "afadjato", "bosomtwe"]);

async function main() {
  const { data: dests } = await db.from("destinations").select("slug,name,lat,lng,radius_km").eq("is_active", true);
  const venues = await fetchAllRows<any>((a, b) =>
    db.from("venues")
      .select("id,name,type,lat,lng,phone,phone_pending,whatsapp_phone,instagram_handle,booking_url,google_maps_url,entry_fee_ghs,is_free,stay_rooms(price_per_night_ghs,is_active)")
      .eq("is_active", true).neq("type", "restaurant").neq("type", "cafe").neq("type", "lounge").order("id").range(a, b)
  );
  const destOf = (v: any) => {
    if (v.lat == null) return null;
    const near = (dests ?? []).map((d: any) => ({ d, km: haversineKm({ lat: +d.lat, lng: +d.lng }, { lat: +v.lat, lng: +v.lng }) })).filter((x: any) => x.km <= Math.max(15, +x.d.radius_km)).sort((a: any, b: any) => a.km - b.km);
    return near[0]?.d ?? null;
  };
  const rows: any[] = [];
  for (const v of venues) {
    const d = destOf(v);
    if (!d || d.slug === "accra") continue;
    let ask: string | null = null;
    if (v.type === "stay" && !(v.stay_rooms ?? []).some((r: any) => r.is_active && r.price_per_night_ghs != null))
      ask = "Room types, nightly rate in cedis for each (weekday and weekend), sleeps how many, breakfast included?";
    else if ((v.type === "activity" || v.type === "outdoor") && v.entry_fee_ghs == null && !v.is_free)
      ask = "Entry fee in cedis for a Ghanaian adult and for a foreign visitor; guide fee if separate; opening hours.";
    if (!ask) continue;
    const phone = v.phone || v.whatsapp_phone || (v.phone_pending ? `${v.phone_pending} (pending approval)` : "");
    rows.push({ priority: FIRST.has(d.slug) ? 1 : 2, destination: d.name, kind: v.type, name: v.name, phone, whatsapp: v.whatsapp_phone ?? "", instagram: v.instagram_handle ?? "", website: v.booking_url || "", maps: v.google_maps_url ?? "", ask, venue_id: v.id });
  }
  // The bus companies, for fares between regional towns.
  const { data: routes } = await db.from("intercity_routes").select("operator,book_phone,book_url").eq("is_active", true);
  const ops = new Map<string, any>();
  for (const r of routes ?? []) if (!ops.has(r.operator) && (r.book_phone || r.book_url)) ops.set(r.operator, r);
  for (const [op, r] of ops) rows.push({ priority: 2, destination: "between towns", kind: "bus", name: op, phone: r.book_phone ?? "", whatsapp: "", instagram: "", website: r.book_url ?? "", maps: "", ask: "2026 fares and departure times: Kumasi to Cape Coast, Takoradi, Sunyani, Tamale, Ho; Cape Coast to Takoradi; Tamale to Bolgatanga and Wa; Bolgatanga to Paga.", venue_id: "" });
  rows.sort((a, b) => a.priority - b.priority || a.destination.localeCompare(b.destination) || a.kind.localeCompare(b.kind) || (b.phone ? 1 : 0) - (a.phone ? 1 : 0));
  const head = ["priority", "destination", "kind", "name", "phone", "whatsapp", "instagram", "website", "maps", "ask", "answer_room_or_ticket", "answer_price_ghs", "answer_visitor_price_ghs", "answer_notes", "called_on", "venue_id"];
  writeFileSync(out, [head.join(","), ...rows.map((r) => head.map((h) => csv(r[h])).join(","))].join("\n"), "utf8");
  const reach = rows.filter((r) => r.phone || r.whatsapp || r.instagram).length;
  console.log(`${rows.length} to ask (${rows.filter((r) => r.priority === 1).length} first), ${reach} with a number or Instagram; stays ${rows.filter((r) => r.kind === "stay").length}, sights ${rows.filter((r) => r.kind === "activity" || r.kind === "outdoor").length}, bus ${ops.size}`);
}
main();
