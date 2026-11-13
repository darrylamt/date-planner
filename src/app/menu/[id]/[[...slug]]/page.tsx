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

  // What Google reads: a restaurant with a priced menu (schema.org).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["restaurant", "cafe", "lounge"].includes(v.type) ? (v.type === "cafe" ? "CafeOrCoffeeShop" : v.type === "lounge" ? "BarOrPub" : "Restaurant") : "LocalBusiness",
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

  return (
    <main className="mx-auto w-full max-w-[680px] px-5 pb-12 pt-[22px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a href="/" aria-label="Duro! home">
        <Logo size={22} />
      </a>

      {v.image_url ? (
        <div className="mt-6 overflow-hidden rounded-btn">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.image_url} alt={name} className="aspect-[16/9] w-full object-cover" />
        </div>
      ) : null}
      {v.image_credit ? <div className="mt-1 text-[11px] text-mutedbrown">{v.image_credit}</div> : null}

      <div className="mt-5 text-caption font-bold uppercase tracking-[0.1em] text-flame">{TYPE[v.type] ?? "Place"} · Menu and prices</div>
      <h1 className="mt-2 font-display text-hero font-bold">{name}</h1>
      <p className="mt-1 text-sub text-cocoa">{where(v)}</p>
      {v.description ? <p className="mt-3 text-[15px] leading-normal">{v.description}</p> : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <a href={`aduro://venue/${v.id}`} className="btn">
          Plan a date here
        </a>
        <a href={storeLink("shared_place")} target="_blank" rel="noopener" className="btn2">
          Get Duro! free
        </a>
      </div>
      <p className="mt-2 text-caption text-mutedbrown">Duro! builds the whole night: where to eat, what to order, what it costs and how to get there.</p>

      {sections.length ? (
        <section className="mt-8">
          <h2 className="font-display text-[22px] font-bold">Menu</h2>
          {latest ? <p className="text-caption text-mutedbrown">Prices as of {monthYear(latest)}. Ask the venue for today&apos;s prices.</p> : null}
          {sections.map((s) => (
            <div key={s.cat} className="mt-5">
              <h3 className="text-caption font-bold uppercase tracking-[0.1em] text-flame">{SECTION[s.cat]}</h3>
              <ul className="mt-2 divide-y divide-black/5">
                {s.items.map((i, n) => (
                  <li key={`${i.name}-${n}`} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="min-w-0">
                      <span className="text-[15px]">{i.name}</span>
                      {i.notes ? <span className="block text-[13px] text-mutedbrown">{i.notes}</span> : null}
                    </span>
                    <span className="shrink-0 font-semibold">{ghs(Number(i.price_ghs))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <p className="card mt-8 p-4 text-[15px]">We&apos;re still getting this menu. Open it in Duro! to see what&apos;s known so far.</p>
      )}

      {hasHours ? (
        <section className="mt-8">
          <h2 className="font-display text-[22px] font-bold">Opening hours</h2>
          <ul className="mt-2 text-[15px]">
            {week.map((d) => (
              <li key={d.day} className="flex justify-between py-1">
                <span>{d.day}</span>
                <span className="text-cocoa">{d.hours}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 flex flex-wrap gap-2 text-[14px]">
        {v.google_maps_url ? (
          <a href={v.google_maps_url} target="_blank" rel="noopener" className="btn2 btnsm">
            Directions
          </a>
        ) : null}
        {v.phone ? (
          <a href={`tel:${v.phone.replace(/\s+/g, "")}`} className="btn2 btnsm">
            Call {v.phone}
          </a>
        ) : null}
        {v.instagram_handle ? (
          <a href={`https://instagram.com/${v.instagram_handle.replace(/^@/, "")}`} target="_blank" rel="noopener" className="btn2 btnsm">
            Instagram
          </a>
        ) : null}
      </section>

      <div className="mt-12">
        <div className="kente" />
        <p className="mt-3 text-caption text-mutedbrown">
          Menus and prices on Duro! are read from the venue&apos;s own menu and dated. Spotted something out of date? Tell us at duroplans.com/support.
        </p>
      </div>
    </main>
  );
}
