import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { StoreButton } from "@/components/StoreButton";
import { storeLink } from "@/lib/links";
import { ghs } from "@/lib/format";
import { isMeName, readBill } from "@/lib/billLink";
import { BillView, CopyNumber } from "./BillClient";

/** How a name on the bill reads to somebody who is not the sender. */
const shown = (name: string) => (isMeName(name) ? "The sender" : name);

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const bill = readBill(params.code);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!bill) return { ...base, title: "A bill split on Duro!" };
  const payer = shown(bill.p[bill.w][0]);
  const title = `${bill.t ? `${bill.t}: ` : ""}${ghs(bill.c)}, split ${bill.p.length} ways`;
  return {
    ...base,
    title,
    description: `${payer} paid. See your share, and where to send it. Split on Duro!`,
    openGraph: { title, description: `${payer} paid. See your share and where to send it.` },
  };
}

/**
 * A bill split in the app, opened from the group chat.
 *
 * Everybody in the group gets the link, and most of them do not have Duro.
 * So it does two jobs: tell each person what they owe and where to send it,
 * plainly and first, and then say what made it, with a way to get the app
 * for the next night out. Nothing on it is stored anywhere; it is read from
 * the link (lib/billLink.ts).
 */
export default function SharedBillPage({ params }: { params: { code: string } }) {
  const bill = readBill(params.code);

  if (!bill) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-6 pt-[22px]">
        <Logo size={22} />
        <div className="mt-16">
          <h1 className="font-display text-[30px] font-bold">This bill link is broken.</h1>
          <p className="mt-3 text-cocoa">Ask whoever sent it to share it again from Duro!</p>
          <StoreButton href={storeLink("split_bill")} page="split" className="btn mt-8">
            Get Duro!
          </StoreButton>
        </div>
      </main>
    );
  }

  const payer = bill.p[bill.w][0];
  const others = bill.p.filter((_, i) => i !== bill.w);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col pb-16">
      <BillView />
      <div className="px-6 pt-[22px]">
        <Logo size={22} />
      </div>

      <section className="mt-8 px-6">
        <div className="text-caption font-bold uppercase tracking-[0.1em] text-flame">🧾 The bill</div>
        <h1 className="mt-2 font-display text-[34px] font-bold leading-[1.1]">{bill.t || "Tonight's bill"}</h1>
        <p className="mt-2 text-sub text-cocoa">
          <span className="font-mono font-bold text-ink">{ghs(bill.c)}</span> split {bill.p.length} ways.{" "}
          {isMeName(payer) ? "The person who sent this paid." : `${payer} paid.`}
        </p>
      </section>

      <section className="card mx-6 mt-6 p-2">
        {bill.p.map(([name, share], i) => (
          <div
            key={`${name}-${i}`}
            className={`flex items-center justify-between rounded-[14px] px-4 py-3.5 ${i === bill.w ? "bg-flame/10" : ""} ${
              i < bill.p.length - 1 ? "border-b border-line/60" : ""
            }`}
          >
            <span className="text-[17px] font-semibold text-ink">
              {shown(name)}
              {i === bill.w ? <span className="ml-2 text-[12px] font-bold uppercase tracking-[0.08em] text-flame">Paid</span> : null}
            </span>
            <span className="font-mono text-[18px] font-bold text-ink">{ghs(share)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 pb-2 pt-3 text-[15px] text-cocoa">
          <span>Total</span>
          <span className="font-mono font-bold">{ghs(bill.c)}</span>
        </div>
      </section>

      {others.length ? (
        <section className="mx-6 mt-6">
          <h2 className="text-[18px] font-bold text-ink">
            {isMeName(payer) ? "Send your share to the person who paid" : `Send your share to ${payer}`}
          </h2>
          {bill.m ? (
            <>
              <p className="mt-1 text-[14.5px] text-cocoa">By mobile money, on:</p>
              <CopyNumber number={bill.m} />
            </>
          ) : (
            <p className="mt-1 text-[14.5px] text-cocoa">They did not add a MoMo number; ask them in the chat.</p>
          )}
        </section>
      ) : null}

      {/* What made this, for the many in the group who have never heard of it. */}
      <section className="mx-6 mt-10 overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-flame/25 via-shell to-amber/10 p-6">
        <div className="text-[13px] font-bold uppercase tracking-[0.1em] text-amber">Split on Duro!</div>
        <h2 className="mt-2 font-display text-[24px] font-bold leading-tight text-ink">Plan the next night out, and split it in seconds.</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-cocoa">
          Duro plans evenings in Accra and Kumasi to your budget: where to eat, where to go after, real menu prices and the ride there. Then it settles the
          bill: spin for who pays, or split it fairly.
        </p>
        <StoreButton href={storeLink("split_bill")} page="split" className="btn mt-5">
          Get Duro! free on iPhone
        </StoreButton>
        <p className="mt-3 text-center text-caption text-mutedbrown">On Android? It is coming soon.</p>
      </section>

      <p className="mt-8 px-6 text-center text-[12.5px] text-mutedbrown">
        Shares worked out in the Duro app by whoever sent this link. <Link href="/" className="underline">What is Duro?</Link>
      </p>
    </main>
  );
}
