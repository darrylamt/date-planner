import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { weekendCaptions, weekendPicks } from "@/lib/weekendPost";
import { lineup, lineupCaption, lineupSections, rangeLabel } from "@/lib/socialPosts";
import { THEMES, SIZES, type FlyerFormat, type FlyerSpec, type FlyerTheme } from "@/lib/flyer";
import { flyerParam } from "@/lib/flyerLink";
import { CopyBox } from "@/components/admin/CopyBox";

export const dynamic = "force-dynamic";

/*
 * Admin → Social posts (owner, 15 Nov 2026): what the social media person
 * posts, ready made. The Thursday weekend post, and lineups of what is on
 * over the coming weeks, each with its picture and caption. Anything else
 * they make in the Flyer maker, starting from any of these.
 */
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function SocialPage({ searchParams }: { searchParams: { theme?: string; format?: string } }) {
  const db = await adminDataClient(["social"]);
  const theme = (Object.keys(THEMES) as FlyerTheme[]).find((t) => t === searchParams.theme) ?? "rose";
  const format = (Object.keys(SIZES) as FlyerFormat[]).find((f) => f === searchParams.format) ?? "post";
  const q = (extra: Record<string, string>) => `/admin/social?${new URLSearchParams({ theme, format, ...extra }).toString()}`;

  const { days, picks } = await weekendPicks(db);
  const { whatsapp, instagram } = weekendCaptions(days, picks);

  // The next four weeks, and next month whole.
  const now = new Date();
  const today = iso(now);
  const in4 = iso(new Date(now.getTime() + 27 * 864e5));
  const nm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nmEnd = iso(new Date(Date.UTC(nm.getUTCFullYear(), nm.getUTCMonth() + 1, 0)));
  const monthName = MONTH[nm.getUTCMonth()];
  const max = format === "story" ? 18 : format === "square" ? 9 : 13;
  const lineups = await Promise.all(
    [
      { key: "next4", title: "Coming up", title2: "in Accra.", from: today, to: in4 },
      { key: "month", title: monthName, title2: "in Accra.", from: iso(nm), to: nmEnd },
    ].map(async (l) => {
      const { items, total } = await lineup(db, l.from, l.to, max);
      const spec: FlyerSpec = { layout: "list", theme, format, eyebrow: rangeLabel(l.from, l.to), title: l.title, title2: l.title2, sections: lineupSections(items), cta: "Plan it on the Duro! app" };
      return { ...l, items, total, d: flyerParam(spec), caption: lineupCaption(`${l.title} ${l.title2.replace(/\.$/, "")},`, l.from, l.to, items) };
    })
  );
  const cards = [0, ...picks.map((_, n) => n + 1)];
  const aspect = format === "story" ? "aspect-[9/16]" : format === "square" ? "aspect-square" : "aspect-[4/5]";

  return (
    <div className="max-w-[1100px]">
      <h1>Social posts</h1>
      <p className="mt-1 max-w-[760px] text-[14px] text-mutedbrown">
        Ready to post. Every picture is made from what Duro! holds, so names, dates and prices are right. Tap a picture to download it; copy the caption
        beside it. To change the words or make something else, open it in the{" "}
        <Link href="/admin/social/flyers" className="font-semibold text-flame">
          Flyer maker
        </Link>
        .
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold">Colour</span>
        {(Object.keys(THEMES) as FlyerTheme[]).map((t) => (
          <Link key={t} href={q({ theme: t })} className={t === theme ? "btn btnsm" : "btn2 btnsm"}>
            {THEMES[t].label}
          </Link>
        ))}
        <span className="ml-3 font-semibold">Size</span>
        {(Object.keys(SIZES) as FlyerFormat[]).map((f) => (
          <Link key={f} href={q({ format: f })} className={f === format ? "btn btnsm" : "btn2 btnsm"}>
            {SIZES[f].label}
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-[20px] font-bold">This weekend · post on Thursday</h2>
        <p className="mt-1 text-[13px] text-mutedbrown">
          Instagram: all the pictures as one carousel, with the Instagram caption. WhatsApp Channel: the first picture with the WhatsApp text.
        </p>
        {picks.length ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cards.map((i) => {
                const src = `/api/weekend-card?i=${i}&theme=${theme}&format=${format}`;
                return (
                  <a key={i} href={src} download={`duro-weekend-${days[0]}-${i}.png`} className="block overflow-hidden rounded-xl ring-1 ring-black/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={i === 0 ? "Cover" : picks[i - 1].title} className={`${aspect} w-full object-cover`} loading="lazy" />
                    <span className="block px-2 py-1.5 text-[12px] font-semibold">{i === 0 ? "Cover" : `${i}. ${picks[i - 1].title}`}</span>
                  </a>
                );
              })}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <CopyBox title="WhatsApp Channel" text={whatsapp} />
              <CopyBox title="Instagram caption" text={instagram} />
            </div>
          </>
        ) : (
          <div className="card mt-3 p-5 text-[14px]">Nothing listed for this weekend yet.</div>
        )}
      </section>

      {lineups.map((l) => (
        <section key={l.key} className="mt-10">
          <h2 className="text-[20px] font-bold">
            {l.title} {l.title2.replace(/\.$/, "")} · {rangeLabel(l.from, l.to)}
          </h2>
          <p className="mt-1 text-[13px] text-mutedbrown">
            {l.items.length
              ? `One-off events only, weekly nights left out. ${l.total > l.items.length ? `${l.items.length} of ${l.total} fit on the picture; the ones with a place, a price and a photo come first.` : `All ${l.total}.`}`
              : "Nothing one-off listed for these dates yet."}
          </p>
          {l.items.length ? (
            <div className="mt-3 grid gap-4 lg:grid-cols-[320px_1fr]">
              <div>
                <a href={`/api/flyer?d=${l.d}&download=1`} className="block overflow-hidden rounded-xl ring-1 ring-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/flyer?d=${l.d}`} alt={`${l.title} ${l.title2}`} className={`${aspect} w-full object-cover`} loading="lazy" />
                </a>
                <div className="mt-2 flex gap-2">
                  <a href={`/api/flyer?d=${l.d}&download=1`} className="btn btnsm">
                    Download
                  </a>
                  <Link href={`/admin/social/flyers?d=${l.d}`} className="btn2 btnsm">
                    Edit in Flyer maker
                  </Link>
                </div>
              </div>
              <CopyBox title="Caption" text={l.caption} />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
