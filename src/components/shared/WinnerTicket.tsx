import { Logo } from "@/components/Logo";
import { qrSvg } from "@/lib/giveaway";
import { SITE_URL } from "@/lib/site";

/** What the giveaway winner sees (src/app/win/[token]/page.tsx). */
export function WinnerTicket({
  token,
  prize,
  qr,
  title,
  when,
  where,
}: {
  token: string;
  prize: string;
  qr: string;
  title: string | null;
  when: string | null;
  where: string | null;
}) {
  return (
    <main className="mx-auto w-full max-w-[480px] px-5 py-10">
      <Logo size={24} href="/" />
      <p className="mt-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-flame">Duro! giveaway</p>
      <h1 className="mt-1 font-display text-[36px] font-bold leading-tight">You won! 🎉</h1>
      <p className="mt-2 text-body text-cocoa">
        Out of everyone who planned their night on Duro!, it&apos;s you. Here is {prize}.
      </p>

      <div className="mt-6 rounded-card border border-line bg-shell p-5">
        <h2 className="text-[22px] font-bold leading-snug">{title ?? "Your ticket"}</h2>
        {when ? <p className="mt-1 text-[15px] text-cocoa">{when}</p> : null}
        {where ? <p className="text-[15px] text-cocoa">{where}</p> : null}
        <div
          className="mx-auto mt-5 aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl bg-white"
          aria-label="Your ticket's QR code"
          role="img"
          dangerouslySetInnerHTML={{ __html: qrSvg(qr) }}
        />
        <p className="mt-2 text-center text-[13px] text-mutedbrown">Admits one</p>
      </div>

      <div className="mt-5 grid gap-2">
        <a
          href={`/win/${token}/ticket`}
          download="duro-ticket.png"
          className="block rounded-btn bg-flame px-5 py-3.5 text-center text-[16px] font-bold text-blush"
        >
          Save the ticket
        </a>
        <p className="text-center text-[14px] text-cocoa">Or take a screenshot of this page.</p>
      </div>

      <ul className="mt-6 grid gap-2 text-[15px] text-cocoa">
        <li>Show the QR code at the gate. It gets scanned there.</li>
        <li>It works once, so don&apos;t share it before you&apos;re in.</li>
        <li>
          Want dinner before?{" "}
          <a href={SITE_URL} className="font-semibold text-flame">
            Plan the rest of your night on Duro!
          </a>
        </li>
      </ul>

      <p className="mt-10 text-[12px] leading-relaxed text-mutedbrown">
        A Duro! giveaway: one free ticket, won by one person who tried for it in the Duro! app. Apple and Google are not
        sponsors of this giveaway and are not involved in it in any way.
      </p>
    </main>
  );
}
