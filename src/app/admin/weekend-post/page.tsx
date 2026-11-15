import { adminDataClient } from "@/lib/adminAuth";
import { weekendCaptions, weekendPicks } from "@/lib/weekendPost";
import { CopyBox } from "./CopyBox";

export const dynamic = "force-dynamic";

/*
 * Admin → Weekend post: the Thursday "This weekend in Accra" post for the
 * WhatsApp Channel and Instagram (growth plan, 13 Nov 2026). Five picks with
 * real prices, the captions ready to copy, and the pictures to download.
 */
export default async function WeekendPostPage() {
  const db = await adminDataClient();
  const { days, picks } = await weekendPicks(db);
  const { whatsapp, instagram } = weekendCaptions(days, picks);
  const cards = [0, ...picks.map((_, n) => n + 1)];

  return (
    <div className="max-w-[1100px]">
      <h1>Weekend post</h1>
      <p className="mt-1 max-w-[760px] text-[14px] text-mutedbrown">
        Every Thursday: post the pictures to Instagram as one carousel with the Instagram caption, and send the WhatsApp text (with the first picture) to
        the Duro! WhatsApp Channel. One-off events with prices come first, then a film or weekly night, then two places people keep in their plans. It
        changes on its own each week.
      </p>

      {picks.length ? (
        <>
          <section className="mt-6">
            <h2 className="adm-section-title">Pictures (1080 × 1350)</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cards.map((i) => (
                <a key={i} href={`/api/weekend-card?i=${i}`} download={`duro-weekend-${days[0]}-${i}.png`} className="block overflow-hidden rounded-xl ring-1 ring-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/weekend-card?i=${i}`} alt={i === 0 ? "Cover" : picks[i - 1].title} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                  <span className="block px-2 py-1.5 text-[12px] font-semibold">{i === 0 ? "Cover" : `${i}. ${picks[i - 1].title}`}</span>
                </a>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-mutedbrown">Tap a picture to download it.</p>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <CopyBox title="WhatsApp Channel" text={whatsapp} />
            <CopyBox title="Instagram caption" text={instagram} />
          </section>
        </>
      ) : (
        <div className="card mt-6 p-5 text-[14px]">Nothing priced or listed for this weekend yet. Add events in Admin → Events, then come back.</div>
      )}
    </div>
  );
}
