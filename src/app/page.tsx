import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SmartImage } from "@/components/SmartImage";
import { AuthErrorNotice } from "@/components/AuthErrorNotice";

/**
 * Landing page — mobile-first at 390px per the design's "home / hero" frame,
 * with a photo collage added per the "more pictures, lively" brief.
 */
const HERO_IMG =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=70";
const COLLAGE = [
  {
    src: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=70",
    alt: "Waterside dinner table",
  },
  {
    src: "https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=800&q=70",
    alt: "Vinyl records at a listening bar",
  },
  {
    src: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=800&q=70",
    alt: "Sip and paint easels",
  },
  {
    src: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=70",
    alt: "Tandem kayak on the lagoon",
  },
];

const VALUE_PROPS = [
  {
    n: "01",
    title: "Prices before you go",
    body: "Menus and costs up front — no surprises when the bill comes.",
  },
  {
    n: "02",
    title: "Beyond the same old spots",
    body: "Places you'd never find scrolling the usual lists.",
  },
  {
    n: "03",
    title: "Built around them",
    body: "Every plan starts with the person you're planning for.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col md:max-w-[1080px]">
      {/* Supabase falls back to the Site URL when a redirect is not
          allow-listed, which lands failed auth links here rather than on
          /login. Explain it instead of showing a blank marketing page. */}
      <div className="px-6 pt-[22px]">
        <AuthErrorNotice />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-[22px]">
        <Logo size={22} />
        <Link href="/plans" className="text-[14px] font-semibold text-mutedbrown hover:text-flame">
          Saved plans
        </Link>
      </div>

      <div className="md:grid md:grid-cols-2 md:items-center md:gap-12 md:px-6">
        <div>
          {/* Hero */}
          <div className="mt-[34px] px-6 md:px-0">
            <h1 className="font-display text-hero font-bold md:text-[52px]">
              Plan a date they&apos;ll <em className="not-italic text-flame">actually</em> remember.
            </h1>
            <p className="mt-4 text-sub text-cocoa">
              Tell us your budget, the vibe, and a little about them — we&apos;ll build a
              back-to-back evening in Accra with real menus and real prices.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5 px-6 md:px-0">
            <Link href="/plan/new" className="btn">
              Plan a date
            </Link>
            <Link href="/plan/example" className="btn2">
              See an example plan
            </Link>
          </div>
        </div>

        {/* Hero photo */}
        <div className="relative mx-6 mt-7 overflow-hidden rounded-card md:mx-0">
          <SmartImage src={HERO_IMG} alt="Golden hour on the Labadi shoreline" className="h-[190px] md:h-[320px]" priority />
          <div className="absolute bottom-3.5 left-4 z-[2] text-[16px] font-medium italic text-blush drop-shadow">
            Saturday, 6 PM · Osu → Labone · GHS 800
          </div>
        </div>
      </div>

      {/* Photo collage — added for liveliness, same visual language */}
      <div className="mt-5 grid grid-cols-4 gap-2 px-6">
        {COLLAGE.map((c) => (
          <SmartImage key={c.src} src={c.src} alt={c.alt} className="h-[72px] rounded-icon md:h-[110px]" sizes="25vw" />
        ))}
      </div>

      {/* Value props — editorial numerals, no icon tiles */}
      <div className="mt-8 flex flex-col gap-5 px-6 md:grid md:grid-cols-3 md:gap-6">
        {VALUE_PROPS.map((v) => (
          <div key={v.title} className="flex items-start gap-4">
            <div className="w-7 shrink-0 pt-[2px]">
              <div className="font-display text-[19px] italic leading-none text-amber">{v.n}</div>
              <div className="mt-2 h-px w-6 bg-flame/50" />
            </div>
            <div>
              <div className="text-[16px] font-bold">{v.title}</div>
              <div className="mt-0.5 text-[14px] leading-normal text-mutedbrown">{v.body}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Testimonials — one from each side, since anyone can be the planner */}
      <div className="mt-7 grid gap-3 px-6 md:grid-cols-2">
        <figure className="rounded-btn bg-sand p-5">
          <div className="text-caption font-bold uppercase tracking-[0.08em] text-mutedbrown">
            Planned with aduro
          </div>
          <blockquote className="mt-1.5 text-[16px] italic leading-relaxed">
            &ldquo;She still talks about that rooftop. I just answered six questions.&rdquo;
          </blockquote>
          <figcaption className="mt-2 text-caption text-mutedbrown">Kwame · East Legon</figcaption>
        </figure>
        <figure className="rounded-btn bg-sand p-5">
          <div className="text-caption font-bold uppercase tracking-[0.08em] text-mutedbrown">
            Planned with aduro
          </div>
          <blockquote className="mt-1.5 text-[16px] italic leading-relaxed">
            &ldquo;He thought I&apos;d hired a planner. It was one lunch break and my phone.&rdquo;
          </blockquote>
          <figcaption className="mt-2 text-caption text-mutedbrown">Ama · Labone</figcaption>
        </figure>
      </div>

      {/* Footer */}
      <div className="mt-auto px-6 pb-7 pt-8">
        <div className="kente" />
        <div className="mt-1.5 flex justify-between text-caption text-mutedbrown">
          <span>aduro · Accra first</span>
          <span>About · Contact</span>
        </div>
      </div>
    </main>
  );
}
