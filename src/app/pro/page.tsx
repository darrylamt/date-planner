import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { planPrice } from "@/lib/paystack";
import { SubscribeButtons } from "./SubscribeButtons";

/*
 * Duro Pro on the website, paid through Paystack (owner, 14 Nov 2026): card,
 * MTN MoMo or Telecel Cash. Not linked from the iPhone app (Apple's rule);
 * shared as duroplans.com/pro. A web subscriber is Pro in the app as soon as
 * they sign in with the same account.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Duro! Pro",
  description: "Plan dates and nights out with Durobot, unlimited trips and stars. Pay with card, MTN MoMo or Telecel Cash.",
};

const PERKS = [
  { title: "Plan by chatting with Durobot", body: "150 messages a month, against 5 on a free account. Ask about any place we know, or anything about being in Ghana." },
  { title: "Trips across Ghana", body: "One trip a month is free. Pro plans as many as you like: the way there, where to stay and every day planned." },
  { title: "Star every place you like", body: "Keep as many places as you want, against 10 on a free account." },
  { title: "Know what to order", body: "Ask Durobot what is good at a place, and what fits your budget, when you arrive." },
];

export default async function ProPage({ searchParams }: { searchParams: { manage?: string } }) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  const signedIn = Boolean(user && !user.is_anonymous);
  const [monthly, yearly] = await Promise.all([planPrice("monthly"), planPrice("yearly")]);

  let pro: { source: string | null; expires: string | null; manage: boolean } | null = null;
  if (signedIn) {
    const { data } = await createServiceClient().from("entitlements").select("tier, status, source, expires_at, paystack_subscription").eq("user_id", user!.id).maybeSingle();
    const r = data as { tier: string; status: string; source: string | null; expires_at: string | null; paystack_subscription: string | null } | null;
    if (r?.tier === "pro" && (r.status === "active" || r.status === "in_grace") && (!r.expires_at || new Date(r.expires_at) > new Date())) {
      pro = { source: r.source, expires: r.expires_at, manage: Boolean(r.paystack_subscription) };
    }
  }
  const saving = monthly && yearly ? Math.round((1 - yearly / (monthly * 12)) * 100) : null;

  return (
    <main className="mx-auto w-full max-w-[640px] px-5 pb-16 pt-[22px]">
      <a href="/" aria-label="Duro! home">
        <Logo size={22} />
      </a>

      <div className="mt-8 text-caption font-bold uppercase tracking-[0.1em] text-flame">Duro! Pro</div>
      <h1 className="mt-2 font-display text-hero font-bold leading-tight">Never spend 30 minutes figuring out where to go again.</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-cocoa">Pay with card, MTN MoMo or Telecel Cash. Cancel any time.</p>

      <ul className="mt-6 grid gap-3">
        {PERKS.map((p) => (
          <li key={p.title} className="card p-4">
            <div className="font-semibold">{p.title}</div>
            <div className="mt-1 text-[14px] leading-snug text-cocoa">{p.body}</div>
          </li>
        ))}
      </ul>

      <section className="mt-8">
        {pro ? (
          <div className="card p-5">
            <div className="font-display text-[22px] font-bold">You&apos;re on Pro</div>
            <p className="mt-1 text-[15px] text-cocoa">
              {pro.source === "apple"
                ? "Through the App Store. Manage it in your iPhone's Settings → your name → Subscriptions."
                : pro.expires
                  ? `Paid until ${new Date(pro.expires).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. It renews unless you cancel.`
                  : "Thanks for being part of Duro!."}
            </p>
            {pro.manage ? (
              <a href="/api/paystack/manage" className="btn2 btnsm mt-4 inline-flex">
                Manage subscription
              </a>
            ) : null}
          </div>
        ) : signedIn ? (
          <SubscribeButtons monthly={monthly} yearly={yearly} saving={saving} />
        ) : (
          <div className="card p-5">
            <div className="font-semibold">Sign in first</div>
            <p className="mt-1 text-[14px] text-cocoa">Use the same account as in the app, so Pro turns on there too.</p>
            {monthly || yearly ? (
              <p className="mt-2 text-[15px] font-semibold">
                {[monthly ? `GH₵${monthly} a month` : null, yearly ? `GH₵${yearly} a year` : null].filter(Boolean).join(" or ")}
              </p>
            ) : null}
            <a href="/login?next=/pro" className="btn mt-4">
              Sign in to subscribe
            </a>
          </div>
        )}
        {searchParams.manage === "failed" ? <p className="mt-3 text-[13px] text-flame">We couldn&apos;t open the subscription page. Try again, or write to support@duroplans.com.</p> : null}
      </section>

      <p className="mt-8 text-[12px] leading-relaxed text-mutedbrown">
        Payments are handled by Paystack. Pro renews each month or year at the price shown until you cancel; cancelling keeps Pro until the end of what you paid for. See our{" "}
        <a href="/terms" className="text-flame">
          terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-flame">
          privacy policy
        </a>
        .
      </p>
    </main>
  );
}
