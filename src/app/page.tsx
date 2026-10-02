import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SmartImage } from "@/components/SmartImage";
import { StoreButton } from "@/components/StoreButton";
import { AuthErrorNotice } from "@/components/AuthErrorNotice";
import { ReturnToApp } from "@/components/ReturnToApp";
import { createServiceClient } from "@/lib/supabase/server";
import { OCCASIONS } from "@/lib/planConstants";
import { ghs, shortDate, time12 } from "@/lib/format";
import { storeLink } from "@/lib/links";

/*
 * Rebuilt hourly, so a seasonal logo (see Logo) arrives and leaves on its
 * dates, and the figures, places and events below stay as true as the
 * catalogue is.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Duro! · Plan outings in Ghana",
  description:
    "Dates, birthdays, a night out with friends or a day on your own. Duro! plans it stop by stop from real menus and real prices in Accra and Kumasi.",
};

const CONTACT = "planbyaduro@gmail.com";

type Place = { name: string; area: string | null; image: string };
type SoonEvent = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  cost: number | null;
  where: string | null;
  image: string | null;
  organiser: string | null;
  logo: string | null;
};
type HomeData = {
  places: number;
  menuPrices: number;
  areas: number;
  cities: string[];
  photos: Place[];
  events: SoonEvent[];
};

/**
 * Everything on this page that is a claim, read from the catalogue.
 *
 * The page used to carry two quotes from "Kwame" and "Ama" that nobody said.
 * A made-up review is the one thing a page about honest prices cannot carry,
 * so what is left is what can be counted: places, menu prices, and the areas
 * that actually have somewhere in them, not every area anybody created.
 * Any read that fails leaves its section out rather than the page blank.
 */
async function loadHome(): Promise<HomeData | null> {
  try {
    const db = createServiceClient();
    const today = new Date().toISOString().slice(0, 10); // Accra is UTC all year
    const [venues, areas, menu, photos, events] = await Promise.all([
      db.from("venues").select("area_id").eq("is_active", true).range(0, 4999),
      db.from("areas").select("id,name,city"),
      db.from("menu_items").select("id", { count: "exact", head: true }),
      db
        .from("venues")
        .select("name,area_id,image_url")
        .eq("is_active", true)
        .not("image_url", "is", null)
        .order("name")
        .limit(16),
      db
        .from("events")
        .select("id,title,event_date,start_time,cost_ghs,venue_id,area_id,image_url,organiser_name,organiser_logo_url")
        .eq("is_active", true)
        .gte("event_date", today)
        .order("event_date")
        .limit(6),
    ]);
    if (venues.error || areas.error) return null;

    const areaById = new Map((areas.data ?? []).map((a) => [a.id as string, a as { name: string; city: string | null }]));
    const used = new Set((venues.data ?? []).map((v) => v.area_id as string).filter(Boolean));
    const cities = [...new Set([...used].map((id) => areaById.get(id)?.city || "Accra"))];

    const evRows = events.data ?? [];
    const venueIds = [...new Set(evRows.map((e) => e.venue_id).filter(Boolean))] as string[];
    const names = venueIds.length
      ? new Map(((await db.from("venues").select("id,name").in("id", venueIds)).data ?? []).map((v) => [v.id, v.name as string]))
      : new Map<string, string>();

    return {
      places: venues.data?.length ?? 0,
      menuPrices: menu.count ?? 0,
      areas: used.size,
      cities,
      photos: (photos.data ?? []).map((v) => ({
        name: v.name as string,
        area: areaById.get(v.area_id as string)?.name ?? null,
        image: v.image_url as string,
      })),
      events: evRows.map((e) => {
        const venue = e.venue_id ? names.get(e.venue_id) : null;
        const area = areaById.get(e.area_id as string)?.name ?? null;
        return {
          id: e.id as string,
          title: e.title as string,
          date: e.event_date as string,
          time: (e.start_time as string | null) ?? null,
          cost: (e.cost_ghs as number | null) ?? null,
          where: [venue, area].filter(Boolean).join(", ") || null,
          image: (e.image_url as string | null) ?? null,
          organiser: (e.organiser_name as string | null) ?? null,
          logo: (e.organiser_logo_url as string | null) ?? null,
        };
      }),
    };
  } catch {
    return null;
  }
}

/** "12,042" → "12,000+": a count that changes every week, said so it stays true. */
const atLeast = (n: number) => (n >= 1000 ? `${(Math.floor(n / 1000) * 1000).toLocaleString("en-GH")}+` : String(n));

export default async function LandingPage() {
  const data = await loadHome();
  const store = storeLink("home_page");

  return (
    <main className="relative min-h-screen overflow-x-clip">
      {/* The evening light: rose from the top left, candle gold from the right. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[760px]">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-flame/25 blur-[120px]" />
        <div className="absolute -right-32 top-24 h-[420px] w-[420px] rounded-full bg-amber/15 blur-[120px]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1120px] px-5 md:px-8">
        {/* Supabase falls back to the Site URL when a redirect is not
            allow-listed, which lands failed auth links here rather than on
            /login. Explain it instead of showing a blank marketing page. */}
        <div className="pt-4">
          {/*
            A sign-in that landed here rather than in the app, rescued. See
            ReturnToApp: Supabase falls back to the Site URL when a redirect is
            not allow-listed, so a Google sign-in from the phone arrives on this
            page with a live session and no way to use it.
          */}
          <ReturnToApp />
          <AuthErrorNotice />
        </div>

        {/* Top bar */}
        <header className="flex items-center justify-between pt-3">
          <Logo size={24} />
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link
              href="#venues"
              className="hidden rounded-chip px-3 py-2 text-[14px] font-semibold text-cocoa hover:text-ink sm:block"
            >
              For venues
            </Link>
            <StoreButton
              href={store}
              page="home"
              className="rounded-chip bg-ink px-4 py-2 text-[14px] font-bold text-cream transition-colors hover:bg-blush"
            >
              Get the app
            </StoreButton>
          </nav>
        </header>

        {/* Hero */}
        <section className="grid items-center gap-12 pb-14 pt-10 md:grid-cols-[1.15fr_0.85fr] md:pb-20 md:pt-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-chip border border-line bg-shell/70 px-3 py-1.5 text-[13px] font-semibold text-cocoa">
              <span className="h-2 w-2 rounded-full bg-amber" />
              Accra and Kumasi · free on iPhone
            </div>
            <h1 className="mt-5 font-display text-[42px] font-bold leading-[1.04] tracking-[-0.025em] sm:text-[54px] md:text-[64px]">
              Your whole night out, planned{" "}
              <span className="relative whitespace-nowrap text-flame">
                to the cedi
                <svg
                  aria-hidden
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                  className="absolute -bottom-2 left-0 h-[10px] w-full text-amber"
                >
                  <path d="M2 8 C 40 2, 80 2, 110 6 S 170 11, 198 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </span>
              .
            </h1>
            <p className="mt-6 max-w-[540px] text-[17px] leading-relaxed text-cocoa md:text-[19px]">
              Say who it&apos;s for, what you want to spend and the mood. Duro! builds the evening stop by
              stop from real menus and real prices, then gets you between them by trotro or Yango.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <StoreButton href={store} page="home" className="inline-block transition-transform hover:-translate-y-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/app-store-badge.svg" alt="Download on the App Store" width={162} height={54} className="block h-[54px] w-auto" />
              </StoreButton>
              <Link href="#how" className="text-[15px] font-semibold text-cocoa underline-offset-4 hover:text-ink hover:underline">
                How it works ↓
              </Link>
            </div>
            <p className="mt-4 text-caption text-mutedbrown">
              On Android? Not yet. A plan somebody shares with you opens in any browser.
            </p>
          </div>

          <PlanPhone />
        </section>
      </div>

      {/* The catalogue, counted */}
      {data ? (
        <section className="relative border-y border-line/60 bg-parchment/80">
          <div className="mx-auto grid w-full max-w-[1120px] grid-cols-2 gap-y-8 px-5 py-9 md:grid-cols-4 md:px-8">
            <Stat value={String(data.places)} label="places to go" />
            <Stat value={atLeast(data.menuPrices)} label="menu prices" />
            <Stat value={String(data.areas)} label="neighbourhoods" />
            <Stat value={String(data.cities.length)} label={data.cities.length === 1 ? "city" : `cities, ${data.cities.join(" and ")}`} />
          </div>
        </section>
      ) : null}

      <div className="relative mx-auto w-full max-w-[1120px] px-5 md:px-8">
        {/* Occasions */}
        <section className="pt-16 md:pt-24">
          <SectionHead
            eyebrow="Not only dates"
            title="Whatever the outing is."
            body="Every plan starts with what it's for. A first date wants easy exits; a birthday wants a fuss."
          />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {OCCASIONS.map((o) => (
              <div key={o.id} className="group rounded-card border border-white/5 bg-shell p-4 transition-colors hover:border-flame/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/mascots/${o.id}.png`}
                  alt=""
                  width={72}
                  height={72}
                  className="-ml-1 h-[72px] w-[72px] transition-transform duration-300 [image-rendering:pixelated] group-hover:-translate-y-1"
                />
                <div className="mt-2 text-[15px] font-bold">{o.title}</div>
                <div className="mt-0.5 text-[13px] leading-snug text-mutedbrown">{o.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-8 pt-16 md:pt-24">
          <SectionHead eyebrow="How it works" title="Six questions. One evening." />
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((s) => (
              <li key={s.n}>
                <div className="font-display text-[44px] font-bold italic leading-none text-amber/90">{s.n}</div>
                <div className="mt-3 h-px w-10 bg-flame/60" />
                <div className="mt-4 text-[19px] font-bold">{s.title}</div>
                <p className="mt-2 text-[15px] leading-relaxed text-cocoa">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Ask Duro! */}
        <section className="pt-16 md:pt-24">
          <div className="grid items-center gap-10 overflow-hidden rounded-[28px] border border-white/5 bg-lagoon p-6 sm:p-10 md:grid-cols-2">
            <div>
              <div className="text-caption font-bold uppercase tracking-[0.12em] text-amber">Ask Duro!</div>
              <h2 className="mt-2 font-display text-[30px] font-bold leading-tight md:text-[38px]">Or just say it.</h2>
              <p className="mt-4 text-[16px] leading-relaxed text-lagoon-faint/85">
                Durobot plans from a sentence and answers questions about the places in Duro!: what is on the menu,
                what it costs, when it is open. When the catalogue doesn&apos;t know, it says so instead of guessing.
              </p>
              <p className="mt-3 text-[13px] text-lagoon-soft">Five messages free, then Duro! Pro.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                {ASKS.map((a) => (
                  <span key={a} className="rounded-chip border border-chipborder bg-cream/40 px-3.5 py-2 text-[13px] text-lagoon-faint">
                    {a}
                  </span>
                ))}
              </div>
            </div>
            <ChatMock />
          </div>
        </section>

        {/* What's on, when anything is */}
        {data && data.events.length ? (
          <section className="pt-16 md:pt-24">
            <SectionHead
              eyebrow="On soon"
              title="Nights out, already in the plan."
              body="Events go into plans for the right date, with the entry price counted in the budget."
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* Real places, drifting past */}
      {data && data.photos.length >= 6 ? (
        <section className="pt-16 md:pt-24" aria-label="Some of the places in Duro!">
          <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8">
            <SectionHead eyebrow="In the catalogue" title="Some of the places you'll be sent." />
          </div>
          <div className="marquee mt-8 overflow-hidden">
            <div className="marquee-track flex w-max">
              {[...data.photos, ...data.photos].map((p, i) => (
                <figure
                  key={`${p.name}-${i}`}
                  aria-hidden={i >= data.photos.length}
                  className="relative mr-3 w-[220px] shrink-0 overflow-hidden rounded-card md:w-[260px]"
                >
                  <SmartImage src={p.image} alt={p.name} className="h-[150px] md:h-[170px]" sizes="260px" />
                  <figcaption className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/75 to-transparent px-3.5 pb-3 pt-8">
                    <div className="truncate text-[14px] font-bold text-blush">{p.name}</div>
                    {p.area ? <div className="text-[12px] text-blush/75">{p.area}</div> : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="relative mx-auto w-full max-w-[1120px] px-5 md:px-8">
        {/* Venues and event planners */}
        <section id="venues" className="scroll-mt-8 pt-16 md:pt-24">
          <div className="grid gap-8 rounded-[28px] border border-line bg-shell p-6 sm:p-10 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <div className="text-caption font-bold uppercase tracking-[0.12em] text-flame">For venues and event planners</div>
              <h2 className="mt-2 font-display text-[28px] font-bold leading-tight md:text-[34px]">
                Run a place, or throw nights out?
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-cocoa">
                Keep your menu, prices, hours and events up to date yourself, and Duro! puts them in front of people
                deciding where to go. It costs nothing to be listed.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/venue/login" className="btn">
                Open the portal
              </Link>
              <a href={`mailto:${CONTACT}?subject=Listing%20on%20Duro!`} className="btn2">
                Ask to be listed
              </a>
            </div>
          </div>
        </section>

        {/* Last word */}
        <section className="py-16 text-center md:py-24">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascots/scene_table.png"
            alt=""
            width={112}
            height={112}
            className="mx-auto h-[112px] w-[112px] [image-rendering:pixelated]"
          />
          <h2 className="mx-auto mt-4 max-w-[640px] font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[46px]">
            This Saturday is <span className="text-flame">sorted</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-[460px] text-[16px] text-cocoa">
            Free to download and free to plan. Duro! Pro adds 150 Durobot messages a month and every venue&apos;s full page.
          </p>
          <div className="mt-8 flex justify-center">
            <StoreButton href={store} page="home" className="inline-block transition-transform hover:-translate-y-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app-store-badge.svg" alt="Download on the App Store" width={162} height={54} className="block h-[54px] w-auto" />
            </StoreButton>
          </div>
        </section>

        {/* Footer */}
        <footer className="pb-8">
          <div className="kente" />
          <div className="mt-3 flex flex-col gap-2 text-caption text-mutedbrown sm:flex-row sm:justify-between">
            <span>Duro! · Plan outings in Ghana</span>
            <span className="flex gap-4">
              <Link href="/privacy" className="hover:text-flame">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-flame">
                Terms
              </Link>
              <a href={`mailto:${CONTACT}`} className="hover:text-flame">
                Contact
              </a>
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Say what it is",
    body: "The occasion, your budget, the day, the area, and a little about who it's for: what they love, what they'd rather avoid.",
  },
  {
    n: "02",
    title: "Get the whole evening",
    body: "Stops back to back, checked against opening hours, with what to order and what it costs. The total stays inside your budget.",
  },
  {
    n: "03",
    title: "Go",
    body: "Trotro or Yango between every stop, a reminder the night before, and a link to send them the plan.",
  },
];

const ASKS = [
  "Dinner for eight in East Legon on Friday",
  "Jollof under GHS 100 in Osu",
  "Is it open on Monday at 9?",
  "Something that isn't eating",
];

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-[640px]">
      <div className="text-caption font-bold uppercase tracking-[0.12em] text-flame">{eyebrow}</div>
      <h2 className="mt-2 font-display text-[30px] font-bold leading-tight tracking-[-0.015em] md:text-[40px]">{title}</h2>
      {body ? <p className="mt-3 text-[16px] leading-relaxed text-cocoa">{body}</p> : null}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-1">
      <div className="font-mono text-[34px] font-bold leading-none tracking-[-0.02em] text-ink md:text-[42px]">{value}</div>
      <div className="mt-2 text-[14px] text-mutedbrown">{label}</div>
    </div>
  );
}

/**
 * What a plan looks like, drawn rather than screenshotted so it stays in step
 * with the site's own type and colour. Labelled an example, and naming no
 * venue, because a price quoted for a real place goes stale and this page
 * would go on quoting it.
 */
function PlanPhone() {
  const stops = [
    { time: "6:30 PM", what: "Dinner", where: "Osu", cost: 420, ride: "Yango · 9 min · GHS 35" },
    { time: "8:30 PM", what: "Cocktails", where: "Labone", cost: 150, ride: "Walk · 6 min" },
    { time: "10:00 PM", what: "Dessert", where: "Labone", cost: 70, ride: null },
  ];
  const total = stops.reduce((n, s) => n + s.cost, 35);
  return (
    <div className="mx-auto w-full max-w-[330px]">
      <div className="relative rounded-[44px] border border-white/10 bg-[#120910] p-2.5 shadow-phone">
        <div className="overflow-hidden rounded-[36px] bg-cream px-4 pb-5 pt-3">
          <div className="mx-auto h-[22px] w-[92px] rounded-full bg-black" />
          <div className="mt-4 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascots/date_night.png" alt="" width={52} height={52} className="h-[52px] w-[52px] [image-rendering:pixelated]" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-mutedbrown">Saturday</div>
              <div className="text-[17px] font-bold leading-tight">Just the two of you</div>
            </div>
          </div>

          <div className="mt-4 rounded-[14px] bg-shell p-3">
            <div className="flex justify-between font-mono text-[12px]">
              <span className="text-cocoa">{ghs(total)}</span>
              <span className="text-mutedbrown">of {ghs(800)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-lagoon-mid">
              <div className="h-full rounded-full bg-gradient-to-r from-flame to-amber" style={{ width: `${(total / 800) * 100}%` }} />
            </div>
          </div>

          <ol className="mt-4">
            {stops.map((s, i) => (
              <li key={s.time} className="relative pl-6">
                <span className="absolute left-0 top-[5px] h-3 w-3 rounded-full border-2 border-flame bg-cream" />
                {i < stops.length - 1 ? <span className="absolute bottom-0 left-[5px] top-5 w-px bg-line" /> : null}
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-mono text-[11px] text-mutedbrown">{s.time}</div>
                  <div className="font-mono text-[12px] font-bold text-flame">{ghs(s.cost)}</div>
                </div>
                <div className="text-[15px] font-bold">
                  {s.what} <span className="font-normal text-cocoa">· {s.where}</span>
                </div>
                {s.ride ? <div className="pb-3.5 pt-1.5 text-[12px] text-mutedbrown">↓ {s.ride}</div> : <div className="pb-1" />}
              </li>
            ))}
          </ol>

          <div className="mt-3 flex gap-2">
            <div className="flex-1 rounded-[12px] bg-flame py-2.5 text-center text-[13px] font-bold text-blush">Save &amp; share</div>
            <div className="rounded-[12px] border border-line px-3 py-2.5 text-[13px] font-semibold text-cocoa">Swap</div>
          </div>
        </div>

        {/* On the frame's edges, where there is nothing of the plan to cover. */}
        <div className="absolute -top-3.5 right-4 rotate-[3deg] rounded-chip border border-white/10 bg-shell px-3 py-1.5 text-[12px] font-bold text-amber shadow-toast">
          ✓ Inside your budget
        </div>
        <div className="absolute -bottom-3.5 left-4 rotate-[-3deg] rounded-chip border border-white/10 bg-shell px-3 py-1.5 text-[12px] font-bold text-ink shadow-toast">
          Real menu prices
        </div>
      </div>
      <p className="mt-7 text-center text-[12px] text-mutedbrown">An example. Yours is built from what&apos;s open on the day.</p>
    </div>
  );
}

/** One exchange, the kind Durobot has every day, and no venue fact in it to go stale. */
function ChatMock() {
  return (
    <div className="mx-auto w-full max-w-[380px] rounded-[24px] bg-cream/70 p-4 ring-1 ring-white/5">
      <div className="ml-auto max-w-[85%] rounded-[18px] rounded-br-[6px] bg-flame px-4 py-2.5 text-[14px] text-blush">
        Somewhere in Osu on Friday for eight of us, around GHS 200 each?
      </div>
      <div className="mt-3 flex items-end gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/duro-icon.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full" />
        <div className="max-w-[85%] rounded-[18px] rounded-bl-[6px] bg-shell px-4 py-2.5 text-[14px] text-ink">
          I can plan that. Dinner then drinks, or one place for the whole night?
        </div>
      </div>
      <div className="mt-3 flex gap-2 pl-10">
        <span className="rounded-chip border border-chipborder px-3 py-1.5 text-[12px] text-cocoa">Dinner then drinks</span>
        <span className="rounded-chip border border-chipborder px-3 py-1.5 text-[12px] text-cocoa">One place</span>
      </div>
    </div>
  );
}

function EventCard({ event: e }: { event: SoonEvent }) {
  const price = e.cost == null ? null : e.cost === 0 ? "Free" : ghs(e.cost);
  return (
    <article className="card flex flex-col">
      <div className="relative">
        <SmartImage src={e.image} alt={e.title} className="h-[180px]" sizes="(max-width: 768px) 100vw, 360px" />
        <div className="absolute left-3 top-3 z-[2] rounded-chip bg-cream/90 px-3 py-1 text-[12px] font-bold text-ink">
          {shortDate(e.date)}
          {e.time ? ` · ${time12(e.time)}` : ""}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[17px] font-bold leading-snug">{e.title}</h3>
        {e.where ? <div className="mt-1 text-[14px] text-cocoa">{e.where}</div> : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          {e.organiser ? (
            <div className="flex min-w-0 items-center gap-2">
              {e.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.logo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
              ) : null}
              <span className="truncate text-[13px] text-mutedbrown">{e.organiser}</span>
            </div>
          ) : (
            <span />
          )}
          {price ? <span className="shrink-0 font-mono text-[13px] font-bold text-amber">{price}</span> : null}
        </div>
      </div>
    </article>
  );
}
