import { createHash, createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/server";

/**
 * Who is probably calling, for counting, never for trusting.
 *
 * A salted hash of the first forwarded address and the browser string, as the
 * name poll did (src/app/api/poll/route.ts). Not an identity: many phones in
 * Accra share one carrier address, and one person can change their browser
 * string, so limits built on this are generous ceilings against scripts, not
 * per-person rules. The raw address is never stored.
 */
export function fingerprint(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ua = req.headers.get("user-agent") ?? "";
  const salt = process.env.RATE_LIMIT_SALT || (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "aduro").slice(-24);
  return createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex");
}

/** Rows in `table` where `column` = `value`, created in the last `withinMs`. */
export async function recentCount(
  db: SupabaseClient,
  table: string,
  column: string,
  value: string,
  withinMs: number,
  extra: Record<string, string> = {}
): Promise<number> {
  let q = db
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", new Date(Date.now() - withinMs).toISOString());
  for (const [k, v] of Object.entries(extra)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

/*
 * A counter per key per window, for the expensive routes (0098, rate_hit):
 * /api/generate and anonymous Durobot messages. Keys are one-way hashes of an
 * account, a phone id or an address, made here and never stored as they came.
 * A counter that cannot answer lets the request through: a broken limiter must
 * never be the reason somebody cannot plan.
 */
export function rateKey(kind: string, value: string): string {
  const secret = process.env.PLANNER_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return `${kind}:${createHmac("sha256", secret).update(value).digest("hex").slice(0, 24)}`;
}

/** The caller's address as Vercel passes it on; null when there is none. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || null;
}

/** One more hit on `key` in this window: true while it is within `limit`. */
export async function allow(key: string, windowSeconds: number, limit: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().rpc("rate_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    });
    return error ? true : data !== false;
  } catch {
    return true;
  }
}
