import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { grantPaystackPro, paystack, planIdOf } from "@/lib/paystack";

/*
 * Where Paystack sends the browser after paying (Test/Live Callback URL:
 * https://www.duroplans.com/pro/done). The payment is checked with Paystack
 * here and Pro turned on at once, so nobody waits for the webhook; the
 * webhook does the same again and keeps renewals going.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Duro! Pro", robots: { index: false } };

type Tx = { status: string; metadata?: { user_id?: string; plan?: string } | null; plan?: { plan_code?: string } | string | null; customer?: { customer_code?: string } };

export default async function ProDone({ searchParams }: { searchParams: { reference?: string; trxref?: string } }) {
  const ref = (searchParams.reference || searchParams.trxref || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100);
  let ok = false;
  let pending = false;
  if (ref) {
    const res = await paystack<Tx>("GET", `/transaction/verify/${encodeURIComponent(ref)}`).catch(() => null);
    const tx = res?.status ? res.data : null;
    const planCode = typeof tx?.plan === "string" ? tx.plan : tx?.plan?.plan_code;
    const plan = planIdOf(planCode) ?? (tx?.metadata?.plan === "yearly" || tx?.metadata?.plan === "monthly" ? tx.metadata.plan : null);
    if (tx?.status === "success" && plan && tx.metadata?.user_id) {
      await grantPaystackPro(tx.metadata.user_id, { plan, customer: tx.customer?.customer_code ?? null });
      ok = true;
    } else if (tx && (tx.status === "pending" || tx.status === "ongoing")) {
      pending = true;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-6 pt-[22px]">
      <a href="/" aria-label="Duro! home">
        <Logo size={22} />
      </a>
      <div className="mt-10">
        {ok ? (
          <>
            <h1 className="font-display text-hero font-bold">You&apos;re on Pro</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-cocoa">
              Thank you. Open Duro! and sign in with the same account: Durobot, trips and stars are unlocked there now.
            </p>
            <a href="aduro://" className="btn mt-6">
              Open Duro!
            </a>
            <a href="/pro" className="btn2 mt-3">
              Your subscription
            </a>
          </>
        ) : pending ? (
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
