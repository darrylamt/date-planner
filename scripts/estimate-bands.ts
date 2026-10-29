/**
 * What a head costs at places with a menu, by kind and band: the measure
 * behind BAND_ESTIMATE_GHS (budget.ts), which prices places with no menu for
 * plans that ask for them. Prints the middle half next to the figures in use,
 * so they can be brought up to date as menus arrive. npm run estimates:bands
 */
import { createClient } from "@supabase/supabase-js";
import { BAND_ESTIMATE_GHS } from "../src/lib/budget";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(JSON.stringify(error));
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type V = { id: string; type: string; price_band: string | null; menu_shared_from: string | null };
type M = { venue_id: string; price_ghs: number; category: string };

const middle = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const at = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] / 10) * 10;
};

(async () => {
  const venues = await all<V>((f, t) => db.from("venues").select("id,type,price_band,menu_shared_from").eq("is_active", true).range(f, t));
  const rows = await all<M>((f, t) => db.from("menu_items").select("venue_id,price_ghs,category").order("id").range(f, t));
  const byVenue = new Map<string, M[]>();
  for (const r of rows) if (Number(r.price_ghs) > 0) byVenue.set(r.venue_id, [...(byVenue.get(r.venue_id) ?? []), r]);

  // A head: the middle main and the middle drink; a café's middle food; a dessert shop's middle sweet; a bar's two middle drinks.
  const heads = new Map<string, number[]>();
  for (const v of venues) {
    const items = byVenue.get(v.menu_shared_from || v.id) ?? byVenue.get(v.id);
    if (!items) continue;
    const of = (...cats: string[]) => items.filter((r) => cats.includes(r.category)).map((r) => Number(r.price_ghs));
    const drink = middle(of("drink"));
    const eat =
      v.type === "restaurant" ? middle(of("main")) ?? middle(of("main", "starter", "side")) :
      v.type === "dessert" ? middle(of("dessert")) ?? middle(of("main", "starter", "dessert", "side")) :
      v.type === "cafe" ? middle(of("main", "starter", "dessert", "side")) : null;
    const head = v.type === "lounge" ? (drink != null ? drink * 2 : null) : eat != null ? eat + (drink ?? 0) : null;
    if (head == null) continue;
    const key = `${v.type}|${v.price_band}`;
    heads.set(key, [...(heads.get(key) ?? []), head]);
  }

  console.log("kind|band          places  middle half   in use");
  for (const [key, xs] of [...heads.entries()].sort()) {
    const used = BAND_ESTIMATE_GHS[key];
    console.log(`${key.padEnd(20)} ${String(xs.length).padStart(5)}  ${`${at(xs, 0.25)} to ${at(xs, 0.75)}`.padEnd(12)}  ${used ? `${used[0]} to ${used[1]}` : "not used"}`);
  }
})();
