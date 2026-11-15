import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { createServiceClient } from "@/lib/supabase/server";
import { grantPaystackPro, paystack, periodFrom, planIdOf, type PlanId } from "@/lib/paystack";
import { Celebrate } from "./Celebrate";

/*
 * Where Paystack sends the browser after paying (Test/Live Callback URL:
 * https://www.duroplans.com/pro/done). The payment is checked with Paystack
 * here and Pro turned on at once, so nobody waits for the webhook; the
 * webhook does the same again and keeps renewals going.
 *
 * Made a moment (owner, 15 Nov 2026: "the success page should be more
 * exciting"): paper in the brand colours, a glowing Pro badge, what it
 * unlocked appearing one by one, and the way back into the app.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome to Duro! Pro", robots: { index: false } };

type Tx = {
  status: string;
  paid_at?: string | null;
  metadata?: { user_id?: string; plan?: string } | null;
  plan?: { plan_code?: string } | string | null;
  customer?: { customer_code?: string; email?: string };
};

const UNLOCKED = [
  { title: "Durobot, 150 messages a month", body: "Plan by chatting, ask what to order, or anything about being in Ghana." },
  { title: "Every trip you want", body: "The way there, where to stay and each day planned, as many as you like." },
  { title: "Unlimited stars", body: "Keep every place you love, not just ten." },
  { title: "Know what to order", body: "Ask Durobot what is good and what fits your budget, when you arrive." },
];

export default async function ProDone({ searchParams }: { searchParams: { reference?: string; trxref?: string } }) {
  const ref = (searchParams.reference || searchParams.trxref || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100);
  let ok = false;
  let pending = false;
  let plan: PlanId | null = null;
  let until: string | null = null;
  let firstName: string | null = null;
  if (ref) {
    const res = await paystack<Tx>("GET", `/transaction/verify/${encodeURIComponent(ref)}`).catch(() => null);
    const tx = res?.status ? res.data : null;
    const planCode = typeof tx?.plan === "string" ? tx.plan : tx?.plan?.plan_code;
    plan = planIdOf(planCode) ?? (tx?.metadata?.plan === "yearly" || tx?.metadata?.plan === "monthly" ? tx.metadata.plan : null);
    const userId = tx?.metadata?.user_id;
    if (tx?.status === "success" && plan && userId) {
      await grantPaystackPro(userId, { plan, customer: tx.customer?.customer_code ?? null, until: periodFrom(tx.paid_at, plan) });
      ok = true;
      const db = createServiceClient();
      const [{ data: ent }, { data: u }] = await Promise.all([
        db.from("entitlements").select("expires_at").eq("user_id", userId).maybeSingle(),
        db.auth.admin.getUserById(userId),
      ]);
      const exp = (ent as { expires_at: string | null } | null)?.expires_at;
      until = exp ? new Date(exp).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
      const meta = u?.user?.user_metadata as { full_name?: string; name?: string; display_name?: string } | undefined;
      firstName = (meta?.display_name || meta?.full_name || meta?.name || "").trim().split(/\s+/)[0] || null;
    } else if (tx && (tx.status === "pending" || tx.status === "ongoing")) {
      pending = true;
    }
  }

  if (!ok) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-6 pt-[22px]">
        <a href="/" aria-label="Duro! home">
          <Logo size={22} />
        </a>
        <div className="mt-10">
          {pending ? (
            <>
              <h1 className="font-display text-hero font-bold">Almost there</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-cocoa">
                Your payment is still being confirmed. If you paid with mobile money, approve it on your phone. Pro turns on by itself once it goes through.
              </p>
              <a href="/pro" className="btn2 mt-6">
                Check again
              </a>
            </>
          ) : (
            <>
              <h1 className="font-display text-hero font-bold">That didn&apos;t go through</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-cocoa">Nothing was charged. You can try again, or write to support@duroplans.com.</p>
              <a href="/pro" className="btn mt-6">
                Try again
              </a>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-[600px] flex-col overflow-hidden px-6 pb-16 pt-[22px]">
      <Celebrate />
      <style>{`
        @keyframes pro-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes pro-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(225,29,72,.35), 0 18px 60px rgba(225,29,72,.25) } 50% { box-shadow: 0 0 0 14px rgba(225,29,72,0), 0 18px 70px rgba(255,181,71,.35) } }
        @keyframes pro-rise { from { transform: translateY(14px); opacity: 0 } to { transform: none; opacity: 1 } }
        .pro-pop { animation: pro-pop .7s cubic-bezier(.2,.9,.3,1.2) both }
        .pro-glow { animation: pro-glow 2.8s ease-in-out .7s infinite }
        .pro-rise { animation: pro-rise .55s ease-out both }
        @media (prefers-reduced-motion: reduce) { .pro-pop, .pro-glow, .pro-rise { animation: none } }
      `}</style>
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(225,29,72,0.20),rgba(255,181,71,0.12),transparent)]" />

      <a href="/" aria-label="Duro! home" className="relative">
        <Logo size={22} />
      </a>

      <section className="relative mt-12 flex flex-col items-center text-center">
        <div className="pro-pop pro-glow flex h-24 w-24 items-center justify-center rounded-[30px] bg-gradient-to-br from-[#E11D48] via-[#F25F4C] to-[#FFB547]">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M12 2.5l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z" />
          </svg>
        </div>
        <div className="pro-rise mt-6 text-caption font-bold uppercase tracking-[0.16em] text-flame" style={{ animationDelay: "250ms" }}>
          Payment confirmed
        </div>
        <h1 className="pro-rise mt-2 font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.02em] sm:text-[54px]" style={{ animationDelay: "350ms" }}>
          Welcome to Pro{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="pro-rise mt-3 max-w-[440px] text-[17px] leading-relaxed text-cocoa" style={{ animationDelay: "450ms" }}>
          The whole of Duro! is yours. Your next night out is about to get a lot easier.
        </p>
        <div className="pro-rise mt-4 inline-flex items-center gap-2 rounded-chip border border-line bg-shell px-4 py-2 text-[14px] font-semibold" style={{ animationDelay: "550ms" }}>
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {plan === "yearly" ? "Yearly" : "Monthly"}
          {until ? <span className="font-normal text-mutedbrown">· paid until {until}</span> : null}
        </div>
      </section>

      <section className="relative mt-10">
        <h2 className="pro-rise text-caption font-bold uppercase tracking-[0.14em] text-mutedbrown" style={{ animationDelay: "650ms" }}>
          Unlocked
        </h2>
        <ul className="mt-3 grid gap-2.5">
          {UNLOCKED.map((u, i) => (
            <li key={u.title} className="pro-rise flex items-start gap-3 rounded-card border border-line bg-shell p-4" style={{ animationDelay: `${750 + i * 120}ms` }}>
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-flame text-blush">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <span>
                <span className="block text-[16px] font-bold">{u.title}</span>
                <span className="mt-0.5 block text-[14px] leading-snug text-cocoa">{u.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="pro-rise relative mt-8 flex flex-col gap-3" style={{ animationDelay: "1250ms" }}>
        <a href="aduro://" className="btn h-[58px] text-[18px]">
          Open Duro! and try it
        </a>
        <a href="/pro" className="btn2">
          Your subscription
        </a>
        <p className="mt-1 text-center text-caption text-mutedbrown">Sign in to the app with this same account. Your receipt is on its way by email from Paystack.</p>
      </section>
    </main>
  );
}
