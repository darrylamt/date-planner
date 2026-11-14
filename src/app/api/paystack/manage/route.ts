import { NextResponse } from "next/server";
import { createServiceClient, getCaller } from "@/lib/supabase/server";
import { paystack } from "@/lib/paystack";
import { SITE_URL } from "@/lib/site";

/** "Manage subscription": Paystack's own page to cancel or change the card or MoMo number. */
export async function GET(req: Request) {
  const caller = await getCaller(req).catch(() => null);
  if (!caller || caller.anonymous) return NextResponse.redirect(`${SITE_URL}/login?next=/pro`, 302);
  const { data } = await createServiceClient().from("entitlements").select("paystack_subscription").eq("user_id", caller.id).maybeSingle();
  const code = (data as { paystack_subscription: string | null } | null)?.paystack_subscription;
  if (!code) return NextResponse.redirect(`${SITE_URL}/pro`, 302);
  const res = await paystack<{ link: string }>("GET", `/subscription/${code}/manage/link`).catch(() => null);
  return NextResponse.redirect(res?.status && res.data?.link ? res.data.link : `${SITE_URL}/pro?manage=failed`, 302);
}
