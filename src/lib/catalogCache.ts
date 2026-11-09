/**
 * A few minutes' memory for catalogue reads (owner, 9 Nov 2026: Supabase egress
 * at 4.52 of the free plan's 5 GB).
 *
 * One plan read 5.9 MB from the database: every menu price in the catalogue
 * (21,000 rows), the whole venue list, the insights, and the full menus of
 * the shortlist. Two plans a minute apart read all of it twice. The catalogue
 * changes a few times a day, by hand, so a plan made on a menu five minutes
 * old is the same plan.
 *
 * Kept per server instance, in memory: nothing to run, nothing to pay for,
 * and a cold instance simply reads the database as it always did.
 */

const TTL_MS = 5 * 60_000;
/** Tables whose rows are the same for every caller: the catalogue, never anybody's own data. */
const CATALOGUE = new Set([
  "venues",
  "menu_items",
  "venue_insights",
  "venue_pull",
  "areas",
  "events",
  "venue_schedules",
  "venue_embeddings",
  "featured_venues",
  "destinations",
  "intercity_routes",
  "stay_rooms",
]);
const MAX_BYTES = 60 * 1024 * 1024;

type Entry = { at: number; status: number; headers: [string, string][]; body: ArrayBuffer };
const store = new Map<string, Entry>();
let held = 0;

function tableOf(url: string): string | null {
  const m = url.match(/\/rest\/v1\/([a-z_]+)(\?|$)/);
  return m ? m[1] : null;
}

function evict(now: number) {
  for (const [k, e] of store) {
    if (now - e.at > TTL_MS || held > MAX_BYTES) {
      store.delete(k);
      held -= e.body.byteLength;
    }
  }
}

/**
 * A fetch for supabase-js that answers a repeated catalogue GET from memory.
 * Keyed on everything that changes the answer: the URL, the page asked for,
 * the count asked for, and whose key asked (anon and service see different
 * columns).
 */
export const catalogueFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const table = tableOf(url);
  if ((method !== "GET" && method !== "HEAD") || !table || !CATALOGUE.has(table)) return fetch(input, init);

  const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const key = [method, url, h.get("range") ?? "", h.get("prefer") ?? "", h.get("accept") ?? "", (h.get("apikey") ?? "").slice(-12)].join("|");
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return new Response(method === "HEAD" ? null : hit.body.slice(0), { status: hit.status, headers: hit.headers });
  }

  const res = await fetch(input, init);
  if (res.status !== 200 && res.status !== 206) return res;
  const body = await res.arrayBuffer();
  const headers = [...res.headers.entries()];
  if (hit) held -= hit.body.byteLength;
  store.set(key, { at: now, status: res.status, headers, body });
  held += body.byteLength;
  if (held > MAX_BYTES) evict(now);
  return new Response(method === "HEAD" ? null : body.slice(0), { status: res.status, headers });
};

/**
 * Menus by venue, remembered for the same few minutes: a shortlist is a
 * different set of venues every plan, so the request as a whole rarely
 * repeats, but Bliss, Chocolate Sarayi and the Honeysuckle are in most of them.
 */
const menus = new Map<string, { at: number; items: unknown[] }>();

export async function menusFor<T extends { venue_id: string }>(ids: string[], load: (missing: string[]) => Promise<T[]>): Promise<T[]> {
  const now = Date.now();
  const missing = ids.filter((id) => {
    const m = menus.get(id);
    return !m || now - m.at >= TTL_MS;
  });
  if (missing.length) {
    const rows = await load(missing);
    const by = new Map<string, T[]>(missing.map((id) => [id, []]));
    for (const r of rows) by.get(r.venue_id)?.push(r);
    for (const [id, items] of by) menus.set(id, { at: now, items });
    if (menus.size > 3000) for (const [k, m] of menus) if (now - m.at >= TTL_MS) menus.delete(k);
  }
  // Copies, so a plan that adjusts a row never changes the next plan's.
  return ids.flatMap((id) => ((menus.get(id)?.items ?? []) as T[]).map((r) => ({ ...r })));
}
