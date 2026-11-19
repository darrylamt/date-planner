import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { createCatalogClient } from "@/lib/supabase/server";
import { listedMenus, menuPath } from "@/lib/menuPage";
import { tidyName } from "@/lib/nudges";
import { SITE_URL } from "@/lib/site";

/*
 * Every menu page, by area (owner's Search Console, 19 Nov 2026): nothing
 * on the site linked to the menu pages, so Google knew them only from the
 * sitemap and had 21 waiting. Linked from the home page and the blog, this
 * gives Google and people a way in to each. Rebuilt once a day.
 */
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Menus and prices in Accra, by area | Duro!",
  description: "The menus and prices of restaurants, cafés and bars across Accra, area by area, kept up to date by Duro!.",
  alternates: { canonical: `${SITE_URL}/menus` },
};

export default async function MenusPage() {
  const menus = await listedMenus(createCatalogClient()).catch(() => []);
  const byArea = new Map<string, typeof menus>();
  for (const m of menus) {
    const a = m.area ?? "Elsewhere";
    byArea.set(a, [...(byArea.get(a) ?? []), m]);
  }
  const areas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  return (
    <main className="mx-auto w-full max-w-[860px] px-6 py-12">
      <Logo size={26} href="/" />
      <h1 className="mt-8 font-display text-[34px] font-bold leading-tight">Menus and prices in Accra</h1>
      <p className="mt-2 text-body text-mutedbrown">
        {menus.length} places, area by area. Each page has the full menu with prices, kept up to date. See also{" "}
        <Link href="/blog" className="font-semibold text-flame">
          where to go this week
        </Link>
        .
      </p>
      <nav className="mt-6 flex flex-wrap gap-2 text-[13px]">
        {areas.map(([a, list]) => (
          <a key={a} href={`#${encodeURIComponent(a)}`} className="rounded-full border border-line px-3 py-1 hover:bg-black/[0.03]">
            {a} <span className="text-mutedbrown">{list.length}</span>
          </a>
        ))}
      </nav>
      <div className="mt-8 grid gap-8">
        {areas.map(([a, list]) => (
          <section key={a} id={encodeURIComponent(a)}>
            <h2 className="text-[20px] font-bold">{a}</h2>
            <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {list
                .sort((x, y) => tidyName(x.name).localeCompare(tidyName(y.name)))
                .map((m) => (
                  <li key={m.id}>
                    <Link href={menuPath(m.id, m.name, m.area)} className="text-[15px] hover:text-flame hover:underline">
                      {tidyName(m.name)} menu
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
