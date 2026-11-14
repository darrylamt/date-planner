import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { PLANS, paystack, planPrice } from "@/lib/paystack";
import { allow, rateKey } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/site";

/**
 * Start a Pro subscription on the website: the signed-in account, the plan
 * chosen, and back the Paystack checkout address (card, MoMo, Telecel Cash).
 * The account id rides along as metadata, so the payment lands on the right
 * row (webhook, and /pro/done straight after paying).
 */
const body = z.object({ plan: z.enum(["monthly", "yearly"]) });

export async function POST(req: Request) {
  const caller = await getCaller(req).catch(() => null);
  if (!caller || caller.anonymous) return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  if (!(await allow(rateKey("paystack:start", caller.id), 3600, 20))) return NextResponse.json({ error: "too_many" }, { status: 429 });

  let plan: "monthly" | "yearly";
  try {
    plan = body.parse(await req.json()).plan;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { data: user } = await createServiceClient().auth.admin.getUserById(caller.id);
  const email = user?.user?.email;
  if (!email) return NextResponse.json({ error: "no_email", message: "Your account needs an email address to subscribe." }, { status: 400 });

  // The plan's own price; Paystack charges the plan amount whatever is sent, but the field is required.
  const price = (await planPrice(plan)) ?? 1;
  const res = await paystack<{ authorization_url: string; reference: string }>("POST", "/transaction/initialize", {
    email,
    amount: Math.round(price * 100),
    plan: PLANS[plan].code,
    currency: "GHS",
    callback_url: `${SITE_URL}/pro/done`,
    channels: ["card", "mobile_money"],
    metadata: { user_id: caller.id, plan, custom_fields: [{ display_name: "Duro! account", variable_name: "account", value: email }] },
  }).catch((e) => ({ status: false, message: String(e), data: null as never }));

  if (!res.status || !res.data?.authorization_url) {
    console.error("paystack initialize failed", res.message);
    return NextResponse.json({ error: "paystack", message: "We couldn't reach the payment page. Please try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ url: res.data.authorization_url });
}
