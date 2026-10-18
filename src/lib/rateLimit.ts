import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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
