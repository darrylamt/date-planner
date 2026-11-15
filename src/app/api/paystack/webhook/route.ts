import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { grantPaystackPro, periodFrom, planIdOf, signedByPaystack, userForCustomer } from "@/lib/paystack";

/*
 * Paystack tells us about payments and subscriptions here (Settings → API
 * Keys & Webhooks → Webhook URL: https://www.duroplans.com/api/paystack/webhook).
 * Only signed bodies are read. Always answers 200 once read, so Paystack
 * does not retry an event we have chosen to ignore.
 *
 * - charge.success on a Pro plan: Pro on, or extended a period.
 * - subscription.create: the subscription's code and next renewal kept.
 * - invoice.payment_failed: Pro kept, marked in grace, until the date runs out.
 * - subscription.not_renew: cancelled, Pro kept to the end of what was paid.
 * - subscription.disable: the subscription has ended, Pro off (unless held some other way).
 */
export const dynamic = "force-dynamic";

type Ev = {
  event: string;
  data: {
    reference?: string;
    status?: string;
    paid_at?: string | null;
    metadata?: { user_id?: string } | string | null;
    customer?: { customer_code?: string; email?: string };
    plan?: { plan_code?: string } | string | null;
    subscription_code?: string;
    next_payment_date?: string | null;
    subscription?: { subscription_code?: string; next_payment_date?: string | null; plan?: { plan_code?: string } };
  };
};

const planCodeOf = (p: Ev["data"]["plan"]) => (typeof p === "string" ? p : p?.plan_code ?? null);
const meta = (m: Ev["data"]["metadata"]) => (m && typeof m === "object" ? m.user_id : undefined);

export async function POST(req: Request) {
  const raw = await req.text();
  if (!signedByPaystack(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let ev: Ev;
  try {
    ev = JSON.parse(raw) as Ev;
  } catch {
    return NextResponse.json({ ignored: "not json" });
  }
  const d = ev.data ?? {};
  const customer = d.customer?.customer_code ?? null;
  const db = createServiceClient();

  try {
    if (ev.event === "charge.success") {
      const plan = planIdOf(planCodeOf(d.plan));
      if (!plan) return NextResponse.json({ ignored: "not a Pro plan" });
      const userId = await userForCustomer(customer, meta(d.metadata));
      if (!userId) return NextResponse.json({ ignored: "no account for this payment" });
      await grantPaystackPro(userId, { plan, customer, until: periodFrom(d.paid_at, plan) });
      return NextResponse.json({ ok: true });
    }

    if (ev.event === "subscription.create") {
      const plan = planIdOf(planCodeOf(d.plan));
      const userId = await userForCustomer(customer, null);
      if (!plan || !userId) return NextResponse.json({ ignored: "unknown subscription" });
      await grantPaystackPro(userId, {
        plan,
        customer,
        subscription: d.subscription_code ?? null,
        until: d.next_payment_date ? new Date(d.next_payment_date) : null,
      });
      return NextResponse.json({ ok: true });
    }

    if (ev.event === "invoice.payment_failed") {
      const userId = await userForCustomer(customer, null);
      if (userId) await db.from("entitlements").update({ status: "in_grace" }).eq("user_id", userId).eq("source", "paystack");
      return NextResponse.json({ ok: true });
    }

    if (ev.event === "subscription.not_renew") {
      // Cancelled: nothing changes until the paid period runs out (expires_at).
      return NextResponse.json({ ok: true });
    }

    if (ev.event === "subscription.disable") {
      const userId = await userForCustomer(customer, null);
      if (userId) {
        await db
          .from("entitlements")
          .update({ tier: "free", status: "cancelled" })
          .eq("user_id", userId)
          .eq("source", "paystack")
          .lte("expires_at", new Date(Date.now() + 86_400_000).toISOString());
      }
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    // Logged and answered 500, so Paystack retries a real failure later.
    console.error("paystack webhook failed", ev.event, e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ ignored: ev.event });
}
