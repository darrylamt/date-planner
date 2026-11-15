import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "./supabase/server";

/*
 * Duro Pro on the website, through Paystack (owner, 14 Nov 2026): card,
 * MTN MoMo or Telecel Cash. Server only: the secret key never leaves it.
 *
 * Apple does not allow the iPhone app to link here or mention it, so nothing
 * in the app points to these pages. Someone who subscribes here is Pro in
 * the app when signed in, because both read the same entitlements row.
 */

export type PlanId = "monthly" | "yearly";

/** Plan codes from the Paystack dashboard (Recurring → Plans). Test mode until launch. */
export const PLANS: Record<PlanId, { code: string; label: string; months: number }> = {
  monthly: { code: process.env.PAYSTACK_PLAN_MONTHLY || "PLN_jflnetmmeyj1oxi", label: "Monthly", months: 1 },
  yearly: { code: process.env.PAYSTACK_PLAN_YEARLY || "PLN_qg21qwb97c490ea", label: "Yearly", months: 12 },
};

export const planIdOf = (code: string | null | undefined): PlanId | null =>
  (Object.keys(PLANS) as PlanId[]).find((k) => PLANS[k].code === code) ?? null;

/** Days of Pro kept past a renewal date, so a late MoMo approval does not cut anyone off. */
const GRACE_DAYS = 3;

export async function paystack<T = unknown>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: boolean; message: string; data: T }> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return (await res.json()) as { status: boolean; message: string; data: T };
}

/** A webhook really came from Paystack: HMAC SHA-512 of the raw body with the secret key. */
export function signedByPaystack(raw: string, signature: string | null): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The plan's price as Paystack holds it, in cedis. Cached an hour. */
export async function planPrice(id: PlanId): Promise<number | null> {
  try {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) return null;
    const res = await fetch(`https://api.paystack.co/plan/${PLANS[id].code}`, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    const j = (await res.json()) as { status: boolean; data?: { amount: number } };
    return j.status && j.data ? j.data.amount / 100 : null;
  } catch {
    return null;
  }
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** One plan period on from when a payment was made, not from now: re-reading a payment must never extend Pro. */
export const periodFrom = (paidAt: string | null | undefined, plan: PlanId): Date | null => (paidAt ? addMonths(new Date(paidAt), PLANS[plan].months) : null);
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}

/**
 * Turn Pro on, or extend it, for a Paystack payment.
 *
 * Never shortens what the account already holds: an admin grant stays a
 * grant, and an App Store subscription that runs longer keeps its date.
 */
export async function grantPaystackPro(
  userId: string,
  opts: { plan: PlanId; until?: Date | null; customer?: string | null; subscription?: string | null }
): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db.from("entitlements").select("tier, status, source, expires_at").eq("user_id", userId).maybeSingle();
  const r = row as { tier: string; status: string; source: string | null; expires_at: string | null } | null;
  const until = addDays(opts.until ?? addMonths(new Date(), PLANS[opts.plan].months), GRACE_DAYS);
  const holdsPro = r?.tier === "pro" && (r.status === "active" || r.status === "in_grace");
  const codes = {
    ...(opts.customer ? { paystack_customer: opts.customer } : {}),
    ...(opts.subscription ? { paystack_subscription: opts.subscription } : {}),
    paystack_plan: PLANS[opts.plan].code,
  };
  if (holdsPro && (r!.source === "grant" || (r!.expires_at && new Date(r!.expires_at) > until))) {
    // Keep their longer Pro; only remember the Paystack codes for renewals and "Manage".
    await db.from("entitlements").update(codes).eq("user_id", userId);
    return;
  }
  await db.from("entitlements").upsert(
    { user_id: userId, tier: "pro", status: "active", source: "paystack", expires_at: until.toISOString(), ...codes, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

/** The account a Paystack customer pays for: from the payment's metadata, else the code we stored. */
export async function userForCustomer(customerCode: string | null | undefined, metadataUser: unknown): Promise<string | null> {
  if (typeof metadataUser === "string" && /^[0-9a-f-]{36}$/i.test(metadataUser)) return metadataUser;
  if (!customerCode) return null;
  const { data } = await createServiceClient().from("entitlements").select("user_id").eq("paystack_customer", customerCode).maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}
