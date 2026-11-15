import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createCatalogClient } from "@/lib/supabase/server";
import { storeLink } from "@/lib/links";
import { describeWeek, parsePeriods } from "@/lib/hours";
import { MIN_ITEMS, menuPath, menuUrl } from "@/lib/menuPage";
import { SITE_URL } from "@/lib/site";
import { tidyName } from "@/lib/nudges";
import { DEFAULT_STYLE, SILHOUETTE, fontStack, fontsHref, palette, safeFont, validHex, type MenuStyle } from "@/lib/menuStyle";

/*
 * A venue's menu and prices, open to anyone and to Google (owner, 13 Nov
 * 2026). The shared links (/v/<id>) stay app-only as decided on 3 Nov; this
 * is the page people search for ("<place> menu prices") and the one a
 * table's QR sticker opens. Built once a day, so search traffic does not
 * become catalogue reads (supabase egress).
 *
 * The venue's own look (0111, owner 14 Nov): its logo and cover, light or
 * dark, an accent colour, a heading font and a body font, set in the venue
 * portal. Dishes are cards with their photo, or a drawn silhouette of a
 * main, a drink or a dessert when they have none.
 */
export const revalidate = 86400;
export const dynamicParams = true;

type Item = { name: string; category: string; price_ghs: number; notes: string | null; image_url: string | null; updated_at: string | null };
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

async function load(id: string): Promise<{ v: V; items: Item[]; style: MenuStyle } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createCatalogClient();
  const { data } = await db
    .from("venues")
    .select("id, name, type, description, image_url, image_credit, is_active, menu_shared_from, opening_periods, instagram_handle, phone, google_maps_url, areas(name, city)")
    .eq("id", id)
    .maybeSingle();
  const v = data as unknown as V | null;
  if (!v || !v.is_active || v.type === "stay") return null;
  const [{ data: rows }, { data: st }] = await Promise.all([
    db.from("menu_items").select("name, category, price_ghs, notes, image_url, updated_at").eq("venue_id", v.menu_shared_from || v.id).gt("price_ghs", 0).order("category").order("price_ghs").limit(600),
    // Before 0111 the table is missing: the default look.
    db.from("venue_menu_style").select("logo_url, cover_url, theme, accent, heading_font, body_font").eq("venue_id", v.id).maybeSingle(),
  ]);
  const s = (st ?? {}) as Partial<MenuStyle>;
  const style: MenuStyle = {
    logo_url: s.logo_url ?? null,
    cover_url: s.cover_url ?? null,
    theme: s.theme === "dark" ? "dark" : "light",
    accent: validHex(s.accent) ?? DEFAULT_STYLE.accent,
    heading_font: safeFont(s.heading_font, DEFAULT_STYLE.heading_font),
    body_font: safeFont(s.body_font, DEFAULT_STYLE.body_font),
  };
  return { v, items: (rows ?? []) as Item[], style };
}

const ghs = (n: number) => `GH₵${Number.isInteger(n) ? n : n.toFixed(2)}`;
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const where = (v: V) => (v.areas ? [v.areas.name, v.areas.city && v.areas.city !== v.areas.name ? v.areas.city : null].filter(Boolean).join(", ") : "Ghana");
/** A dish typed in capitals, in normal case; anything else as written. */
const dishName = (n: string) => (n.length > 3 && n === n.toUpperCase() && /[A-Z]/.test(n) ? n.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()) : n);

export async function generateMetadata({ params }: { params: { id: string; slug?: string[] } }): Promise<Metadata> {
  const got = await load(params.id);
  if (!got) return { title: "Menu not found", robots: { index: false } };
  const { v, items, style } = got;
  const name = tidyName(v.name);
  const prices = items.map((i) => i.price_ghs);
  const range = prices.length ? ` Prices from ${ghs(Math.min(...prices))} to ${ghs(Math.max(...prices))}.` : "";
  const latest = items.map((i) => i.updated_at).filter(Boolean).sort().pop();
  const title = `${name} menu and prices${latest ? ` ${new Date(latest).getUTCFullYear()}` : ""} · ${v.areas?.name ?? "Accra"}`;
  const description = `${name}, ${where(v)}: the full menu with prices${items.length ? ` (${items.length} items)` : ""}.${range} Plan a date or a night out here with Duro!.`;
  const canonical = menuUrl(v.id, v.name, v.areas?.name);
  const image = style.cover_url ?? v.image_url;
  return {
    title,
    description,
    alternates: { canonical },
    robots: items.length >= MIN_ITEMS ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: canonical, images: image ? [image] : [] },
  };
}

function Silhouette({ category, color }: { category: string; color: string }) {
  return (
    <svg viewBox="0 0 64 64" className="h-1/2 w-1/2" aria-hidden="true">
      <path d={SILHOUETTE[category] ?? SILHOUETTE.other} fill={color} fillRule="evenodd" />
    </svg>
  );
}

export default async function MenuPage({ params }: { params: { id: string; slug?: string[] } }) {
  const got = await load(params.id);
  if (!got) notFound();
  const { v, items, style } = got;
  const name = tidyName(v.name);
  // One address per menu: old or missing words go to the current ones.
  const path = menuPath(v.id, v.name, v.areas?.name);
  if (`/menu/${params.id}/${(params.slug ?? []).join("/")}` !== path) permanentRedirect(path);

  const c = palette(style);
  const heading = fontStack(style.heading_font);
  const body = fontStack(style.body_font);
  const cover = style.cover_url ?? v.image_url;

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
    ...(cover ? { image: cover } : {}),
    ...(style.logo_url ? { logo: style.logo_url } : {}),
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
        hasMenuItem: s.items.slice(0, 80).map((i) => ({ "@type": "MenuItem", name: i.name, ...(i.image_url ? { image: i.image_url } : {}), offers: { "@type": "Offer", price: i.price_ghs, priceCurrency: "GHS" } })),
      })),
    },
  };

  const facts = [
    prices.length ? { label: "Prices", value: `${ghs(Math.min(...prices))} to ${ghs(Math.max(...prices))}` } : null,
    typicalMain != null ? { label: "A main, typically", value: ghs(typicalMain) } : null,
    items.length ? { label: "On the menu", value: `${items.length} items` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const pill = "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full px-5 text-[14px] font-semibold";

  return (
    <div className="min-h-screen pb-28" style={{ background: c.bg, color: c.ink, fontFamily: body }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={fontsHref([style.heading_font, style.body_font])} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Top bar */}
      <header className="sticky top-0 z-20 backdrop-blur-md" style={{ background: `${c.bg}E6`, borderBottom: `1px solid ${c.line}` }}>
        <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center justify-between gap-3 px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {style.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.logo_url} alt={`${name} logo`} className="h-8 w-8 shrink-0 rounded-full object-cover" style={{ border: `1px solid ${c.line}` }} />
            ) : null}
            <span className="truncate text-[17px] font-bold" style={{ fontFamily: heading }}>
              {name}
            </span>
          </div>
          <a href={storeLink("shared_place")} target="_blank" rel="noopener" className={pill} style={{ background: c.accent, color: c.onAccent, height: 36, fontSize: 13 }}>
            Get Duro!
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1040px] px-5">
        {/* Cover, with the name on it */}
        <section className="relative mt-5 overflow-hidden rounded-[28px]" style={{ background: c.tint }}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={name} className="h-[260px] w-full object-cover sm:h-[380px]" />
          ) : (
            <div className="h-[200px] w-full sm:h-[260px]" style={{ background: `radial-gradient(120% 120% at 15% 0%, ${c.accent}55, transparent 60%), radial-gradient(100% 100% at 100% 100%, ${c.accent}33, transparent 60%)` }} />
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.15) 55%, transparent)" }} />
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 sm:p-8">
            {style.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl border-2 border-white/80 object-cover sm:h-20 sm:w-20" />
            ) : null}
            <div className="min-w-0">
              <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/85">
                {TYPE[v.type] ?? "Place"} · {where(v)}
              </div>
              <h1 className="mt-1 text-[38px] font-extrabold leading-[1.02] text-white sm:text-[56px]" style={{ fontFamily: heading }}>
                {name}
              </h1>
            </div>
          </div>
        </section>
        {v.image_credit && !style.cover_url ? <div className="mt-1 text-[11px]" style={{ color: c.muted }}>{v.image_credit}</div> : null}

        {/* At a glance */}
        <section className="mt-5 grid grid-cols-3 gap-2 sm:max-w-[620px]">
          {facts.map((f) => (
            <div key={f.label} className="rounded-2xl px-3 py-3" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: c.muted }}>
                {f.label}
              </div>
              <div className="mt-1 text-[15px] font-bold">{f.value}</div>
            </div>
          ))}
        </section>

        {v.description ? (
          <p className="mt-5 max-w-[680px] text-[16px] leading-relaxed" style={{ color: c.muted }}>
            {v.description}
          </p>
        ) : null}

        <section className="mt-5 flex flex-wrap gap-2">
          {v.google_maps_url ? (
            <a href={v.google_maps_url} target="_blank" rel="noopener" className={pill} style={{ border: `1.5px solid ${c.line}`, background: c.surface }}>
              Directions
            </a>
          ) : null}
          {v.phone ? (
            <a href={`tel:${v.phone.replace(/\s+/g, "")}`} className={pill} style={{ border: `1.5px solid ${c.line}`, background: c.surface }}>
              Call
            </a>
          ) : null}
          {v.instagram_handle ? (
            <a href={`https://instagram.com/${v.instagram_handle.replace(/^@/, "")}`} target="_blank" rel="noopener" className={pill} style={{ border: `1.5px solid ${c.line}`, background: c.surface }}>
              Instagram
            </a>
          ) : null}
        </section>

        {/* The menu */}
        {sections.length ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-[40px] font-extrabold leading-none sm:text-[48px]" style={{ fontFamily: heading, color: c.ink }}>
                Menu
              </h2>
              {latest ? (
                <span className="text-[12px]" style={{ color: c.muted }}>
                  Prices as of {monthYear(latest)}
                </span>
              ) : null}
            </div>

            {sections.length > 1 ? (
              <nav aria-label="Menu sections" className="sticky top-14 z-10 -mx-5 mt-4 overflow-x-auto px-5 py-3 backdrop-blur-md" style={{ background: `${c.bg}E6` }}>
                <div className="flex gap-2">
                  {sections.map((s) => (
                    <a key={s.cat} href={`#${s.cat}`} className={pill} style={{ background: c.accent, color: c.onAccent }}>
                      {SECTION[s.cat]}
                    </a>
                  ))}
                </div>
              </nav>
            ) : null}

            {sections.map((s) => (
              <div key={s.cat} id={s.cat} className="mt-8 scroll-mt-32">
                <h3 className="text-[24px] font-bold" style={{ fontFamily: heading }}>
                  {SECTION[s.cat]}
                  <span className="ml-2 text-[14px] font-medium" style={{ color: c.muted, fontFamily: body }}>
                    {s.items.length}
                  </span>
                </h3>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {s.items.map((i, n) => (
                    <li key={`${i.name}-${n}`} className="flex flex-col overflow-hidden rounded-[20px] p-2.5" style={{ background: c.tint }}>
                      <div className={`flex ${i.image_url ? "aspect-square" : "aspect-[4/3]"} items-center justify-center overflow-hidden rounded-[14px]`} style={{ background: c.surface }}>
                        {i.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={i.image_url} alt={dishName(i.name)} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <Silhouette category={i.category} color={`${c.accent}40`} />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
                        <div className="text-[15px] font-bold leading-snug">{dishName(i.name)}</div>
                        {i.notes ? (
                          <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug" style={{ color: c.muted }}>
                            {i.notes}
                          </div>
                        ) : null}
                        <div className="mt-auto pt-2 text-[16px] font-extrabold" style={{ color: c.accent }}>
                          {ghs(Number(i.price_ghs))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-6 text-[12px]" style={{ color: c.muted }}>
              Read from the venue&apos;s own menu. Prices can change, so check on the day.
            </p>
          </section>
        ) : (
          <p className="mt-10 rounded-2xl p-5 text-[15px]" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
            We&apos;re still getting this menu. Open it in Duro! to see what&apos;s known so far.
          </p>
        )}

        {/* Hours */}
        {hasHours ? (
          <section className="mt-10 max-w-[620px]">
            <h2 className="text-[26px] font-bold" style={{ fontFamily: heading }}>
              Opening hours
            </h2>
            <ul className="mt-3 overflow-hidden rounded-2xl text-[15px]" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
              {week.map((d) => (
                <li key={d.day} className="flex justify-between gap-4 px-4 py-2.5" style={{ borderBottom: `1px solid ${c.line}` }}>
                  <span style={{ color: c.muted }}>{d.day}</span>
                  <span className="font-medium">{d.hours}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* What Duro! does */}
        <section className="mt-10 overflow-hidden rounded-[28px] p-6 sm:p-8" style={{ background: c.accent, color: c.onAccent }}>
          <h2 className="text-[28px] font-extrabold leading-tight" style={{ fontFamily: heading }}>
            Make a night of it
          </h2>
          <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-white/90">
            Duro! plans the whole evening around {name}: where to go before or after, what to order, what it all costs and how to get there.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a href={`aduro://venue/${v.id}`} className={`${pill} h-12 bg-white`} style={{ color: c.accent }}>
              Plan a date here
            </a>
            <a href={storeLink("shared_place")} target="_blank" rel="noopener" className={`${pill} h-12`} style={{ border: "1.5px solid rgba(255,255,255,0.6)", color: "#fff" }}>
              Get Duro! free
            </a>
          </div>
        </section>

        <footer className="mt-10 pt-4" style={{ borderTop: `1px solid ${c.line}` }}>
          <p className="text-[12px] leading-relaxed" style={{ color: c.muted }}>
            Menu page by <a href="/" style={{ color: c.accent }}>Duro!</a>. Menus and prices are read from each venue&apos;s own menu and dated. Spotted something out of date? Tell us at duroplans.com/support.
          </p>
        </footer>
      </main>

      {/* The plan button, held at the foot of a phone screen */}
      <div className="fixed inset-x-0 bottom-0 z-30 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:hidden" style={{ background: `${c.bg}EE`, borderTop: `1px solid ${c.line}` }}>
        <a href={`aduro://venue/${v.id}`} className={`${pill} h-12 w-full text-[16px]`} style={{ background: c.accent, color: c.onAccent }}>
          Plan a date here
        </a>
      </div>
    </div>
  );
}
