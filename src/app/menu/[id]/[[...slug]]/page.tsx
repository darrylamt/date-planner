import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createCatalogClient } from "@/lib/supabase/server";
import { storeLink } from "@/lib/links";
import { describeWeek, parsePeriods } from "@/lib/hours";
import { MIN_ITEMS, menuPath, menuUrl } from "@/lib/menuPage";
import { SITE_URL } from "@/lib/site";
import { tidyName } from "@/lib/nudges";

/*
 * A venue's menu and prices, open to anyone and to Google (owner, 13 Nov
 * 2026). The shared links (/v/<id>) stay app-only as decided on 3 Nov; this
 * is the page people search for ("<place> menu prices") and the one a
 * table's QR sticker opens. Built once a day, so search traffic does not
 * become catalogue reads (supabase egress).
 *
 * Redesigned the same day (owner): a photo header with the name on it, the
 * facts at a glance, section tabs, dishes with price tags, and the plan
 * button held at the foot of a phone screen.
 */
export const revalidate = 86400;
export const dynamicParams = true;

type Item = { name: string; category: string; price_ghs: number; notes: string | null; updated_at: string | null };
type V = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  image_url: string | null;
  image_credit: string | null;
  is_active: boolean;
  menu_shared_from: string | null;
  opening_periods: unknown;
  instagram_handle: string | null;
  phone: string | null;
  google_maps_url: string | null;
  areas: { name: string; city: string | null } | null;
};

const SECTION: Record<string, string> = { starter: "Starters", main: "Mains", dessert: "Desserts", drink: "Drinks", activity: "Activities", other: "More" };
const ORDER = ["starter", "main", "dessert", "drink", "activity", "other"];
const TYPE: Record<string, string> = { restaurant: "Restaurant", cafe: "Café", lounge: "Bar and lounge", activity: "Things to do", outdoor: "Outdoors", dessert: "Dessert" };

async function load(id: string): Promise<{ v: V; items: Item[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createCatalogClient();
  const { data } = await db
    .from("venues")
    .select("id, name, type, description, image_url, image_credit, is_active, menu_shared_from, opening_periods, instagram_handle, phone, google_maps_url, areas(name, city)")
    .eq("id", id)
    .maybeSingle();
  const v = data as unknown as V | null;
  if (!v || !v.is_active || v.type === "stay") return null;
  const { data: rows } = await db
    .from("menu_items")
    .select("name, category, price_ghs, notes, updated_at")
    .eq("venue_id", v.menu_shared_from || v.id)
    .gt("price_ghs", 0)
    .order("category")
    .order("price_ghs")
    .limit(600);
  return { v, items: (rows ?? []) as Item[] };
}

/** A dish typed in capitals, in normal case; anything else as written. */
const dishName = (n: string) => (n.length > 3 && n === n.toUpperCase() && /[A-Z]/.test(n) ? n.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()) : n);
const ghs = (n: number) => `GH₵${Number.isInteger(n) ? n : n.toFixed(2)}`;
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const where = (v: V) => (v.areas ? [v.areas.name, v.areas.city && v.areas.city !== v.areas.name ? v.areas.city : null].filter(Boolean).join(", ") : "Ghana");

export async function generateMetadata({ params }: { params: { id: string; slug?: string[] } }): Promise<Metadata> {
  const got = await load(params.id);
  if (!got) return { title: "Menu not found", robots: { index: false } };
  const { v, items } = got;
  const name = tidyName(v.name);
  const prices = items.map((i) => i.price_ghs);
  const range = prices.length ? ` Prices from ${ghs(Math.min(...prices))} to ${ghs(Math.max(...prices))}.` : "";
  const latest = items.map((i) => i.updated_at).filter(Boolean).sort().pop();
  const title = `${name} menu and prices${latest ? ` ${new Date(latest).getUTCFullYear()}` : ""} · ${v.areas?.name ?? "Accra"}`;
  const description = `${name}, ${where(v)}: the full menu with prices${items.length ? ` (${items.length} items)` : ""}.${range} Plan a date or a night out here with Duro!.`;
  const canonical = menuUrl(v.id, v.name, v.areas?.name);
  return {
    title,
    description,
    alternates: { canonical },
    robots: items.length >= MIN_ITEMS ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: canonical, images: v.image_url ? [v.image_url] : [] },
  };
}

export default async function MenuPage({ params }: { params: { id: string; slug?: string[] } }) {
  const got = await load(params.id);
  if (!got) notFound();
  const { v, items } = got;
  const name = tidyName(v.name);
  // One address per menu: old or missing words go to the current ones.
  const path = menuPath(v.id, v.name, v.areas?.name);
  if (`/menu/${params.id}/${(params.slug ?? []).join("/")}` !== path) permanentRedirect(path);

  const sections = ORDER.map((cat) => ({ cat, items: items.filter((i) => (ORDER.includes(i.category) ? i.category : "other") === cat) })).filter((s) => s.items.length);
  const week = describeWeek(parsePeriods(v.opening_periods));
  const hasHours = week.some((d) => d.hours && !/not known|unknown/i.test(d.hours));
  const latest = items.map((i) => i.updated_at).filter(Boolean).sort().pop();
  const prices = items.map((i) => Number(i.price_ghs));
  const mains = items.filter((i) => i.category === "main").map((i) => Number(i.price_ghs)).sort((a, b) => a - b);
  const typicalMain = mains.length ? mains[Math.floor(mains.length / 2)] : null;

  // What Google reads: a restaurant with a priced menu (schema.org).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": v.type === "cafe" ? "CafeOrCoffeeShop" : v.type === "lounge" ? "BarOrPub" : v.type === "restaurant" ? "Restaurant" : "LocalBusiness",
    name,
    url: `${SITE_URL}${path}`,
    ...(v.image_url ? { image: v.image_url } : {}),
    ...(v.description ? { description: v.description } : {}),
    address: { "@type": "PostalAddress", addressLocality: v.areas?.name ?? undefined, addressRegion: v.areas?.city ?? undefined, addressCountry: "GH" },
    ...(v.phone ? { telephone: v.phone } : {}),
    ...(v.google_maps_url ? { hasMap: v.google_maps_url } : {}),
    currenciesAccepted: "GHS",
    hasMenu: {
      "@type": "Menu",
      hasMenuSection: sections.map((s) => ({
        "@type": "MenuSection",
        name: SECTION[s.cat],
        hasMenuItem: s.items.slice(0, 80).map((i) => ({ "@type": "MenuItem", name: i.name, offers: { "@type": "Offer", price: i.price_ghs, priceCurrency: "GHS" } })),
      })),
    },
  };

  const facts = [
    prices.length ? { label: "Prices", value: `${ghs(Math.min(...prices))} to ${ghs(Math.max(...prices))}` } : null,
    typicalMain != null ? { label: "A main, typically", value: ghs(typicalMain) } : null,
    items.length ? { label: "On the menu", value: `${items.length} items` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="pb-28">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-cream/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center justify-between px-5">
          <a href="/" aria-label="Duro! home">
            <Logo size={20} />
          </a>
          <a href={storeLink("shared_place")} target="_blank" rel="noopener" className="rounded-chip bg-white/10 px-4 py-2 text-[13px] font-semibold text-ink hover:bg-white/15">
            Get the app
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5">
        {/* Header: the picture, with the name on it */}
        <section className="relative mt-4 overflow-hidden rounded-card border border-white/5 bg-shell">
          {v.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.image_url} alt={name} className="aspect-[4/3] w-full object-cover sm:aspect-[16/9]" />
          ) : (
            <div className="h-[190px] w-full bg-[radial-gradient(120%_90%_at_20%_0%,rgba(226,61,109,0.45),transparent_60%),radial-gradient(90%_80%_at_100%_100%,rgba(229,176,78,0.30),transparent_60%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-chip bg-flame px-3 py-1 text-[12px] font-bold uppercase tracking-[0.08em] text-blush">Menu and prices</span>
              <span className="rounded-chip bg-black/45 px-3 py-1 text-[12px] font-semibold text-blush backdrop-blur">{TYPE[v.type] ?? "Place"}</span>
            </div>
            <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.05] text-white sm:text-[42px]">{name}</h1>
            <p className="mt-1 text-[15px] text-white/80">{where(v)}</p>
          </div>
        </section>
        {v.image_credit ? <div className="mt-1 text-[11px] text-mutedbrown">{v.image_credit}</div> : null}

        {/* At a glance */}
        {facts.length ? (
          <section className="mt-4 grid grid-cols-3 gap-2">
            {facts.map((f) => (
              <div key={f.label} className="rounded-[14px] border border-white/5 bg-shell px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mutedbrown">{f.label}</div>
                <div className="mt-1 text-[15px] font-bold text-ink">{f.value}</div>
              </div>
            ))}
          </section>
        ) : null}

        {v.description ? <p className="mt-5 text-[15px] leading-relaxed text-cocoa">{v.description}</p> : null}

        {/* Ways to reach it */}
        <section className="mt-5 flex flex-wrap gap-2">
          {v.google_maps_url ? (
            <a href={v.google_maps_url} target="_blank" rel="noopener" className="btn2 btnsm">
              Directions
            </a>
          ) : null}
          {v.phone ? (
            <a href={`tel:${v.phone.replace(/\s+/g, "")}`} className="btn2 btnsm">
              Call
            </a>
          ) : null}
          {v.instagram_handle ? (
            <a href={`https://instagram.com/${v.instagram_handle.replace(/^@/, "")}`} target="_blank" rel="noopener" className="btn2 btnsm">
              Instagram
            </a>
          ) : null}
        </section>

        {/* The menu */}
        {sections.length ? (
          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[26px] font-bold">Menu</h2>
              {latest ? <span className="text-[12px] text-mutedbrown">Prices as of {monthYear(latest)}</span> : null}
            </div>

            {sections.length > 1 ? (
              <nav aria-label="Menu sections" className="sticky top-14 z-10 -mx-5 mt-3 overflow-x-auto bg-cream/85 px-5 py-2 backdrop-blur-md">
                <div className="flex gap-2">
                  {sections.map((s) => (
                    <a key={s.cat} href={`#${s.cat}`} className="whitespace-nowrap rounded-chip border border-chipborder bg-shell px-4 py-2 text-[14px] font-semibold text-cocoa hover:border-flame hover:text-ink">
                      {SECTION[s.cat]} <span className="text-mutedbrown">{s.items.length}</span>
                    </a>
                  ))}
                </div>
              </nav>
            ) : null}

            {sections.map((s) => (
              <div key={s.cat} id={s.cat} className="mt-6 scroll-mt-32">
                <h3 className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.12em] text-amber">
                  {SECTION[s.cat]}
                  <span className="h-px flex-1 bg-white/10" />
                </h3>
                <ul className="mt-2 overflow-hidden rounded-card border border-white/5 bg-shell">
                  {s.items.map((i, n) => (
                    <li key={`${i.name}-${n}`} className="flex items-start justify-between gap-4 border-b border-white/5 px-4 py-3 last:border-b-0">
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-ink">{dishName(i.name)}</span>
                        {i.notes ? <span className="mt-0.5 block text-[13px] leading-snug text-mutedbrown">{i.notes}</span> : null}
                      </span>
                      <span className="shrink-0 rounded-chip bg-flame/15 px-3 py-1 text-[14px] font-bold text-ink">{ghs(Number(i.price_ghs))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-4 text-[12px] text-mutedbrown">Read from the venue&apos;s own menu. Prices can change, so check on the day.</p>
          </section>
        ) : (
          <p className="card mt-8 p-5 text-[15px]">We&apos;re still getting this menu. Open it in Duro! to see what&apos;s known so far.</p>
        )}

        {/* Hours */}
        {hasHours ? (
          <section className="mt-8">
            <h2 className="font-display text-[22px] font-bold">Opening hours</h2>
            <ul className="mt-3 overflow-hidden rounded-card border border-white/5 bg-shell text-[15px]">
              {week.map((d) => (
                <li key={d.day} className="flex justify-between gap-4 border-b border-white/5 px-4 py-2.5 last:border-b-0">
                  <span className="text-cocoa">{d.day}</span>
                  <span className="font-medium text-ink">{d.hours}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* What Duro! does */}
        <section className="mt-10 overflow-hidden rounded-card border border-flame/25 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(226,61,109,0.22),transparent_60%)] p-6">
          <h2 className="font-display text-[22px] font-bold">Make a night of it</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-cocoa">
            Duro! plans the whole evening around {name}: where to go before or after, what to order, what it all costs and how to get there.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <a href={`aduro://venue/${v.id}`} className="btn sm:flex-1">
              Plan a date here
            </a>
            <a href={storeLink("shared_place")} target="_blank" rel="noopener" className="btn2 sm:flex-1">
              Get Duro! free
            </a>
          </div>
        </section>

        <footer className="mt-10 border-t border-white/10 pt-4">
          <p className="text-[12px] leading-relaxed text-mutedbrown">
            Menus and prices on Duro! are read from each venue&apos;s own menu and dated. Spotted something out of date? Tell us at duroplans.com/support.
          </p>
        </footer>
      </main>

      {/* The plan button, held at the foot of a phone screen */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-cream/90 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:hidden">
        <a href={`aduro://venue/${v.id}`} className="btn h-[50px] w-full">
          Plan a date here
        </a>
      </div>
    </div>
  );
}
