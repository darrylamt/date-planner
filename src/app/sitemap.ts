import type { MetadataRoute } from "next";
import { createCatalogClient } from "@/lib/supabase/server";
import { listedMenus, menuUrl } from "@/lib/menuPage";
import { SITE_URL } from "@/lib/site";

/** For Google: the home page and every menu worth a page (menuPage.ts). Rebuilt once a day. */
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const menus = await listedMenus(createCatalogClient()).catch(() => []);
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/support`, changeFrequency: "yearly", priority: 0.2 },
    ...menus.map((m) => ({
      url: menuUrl(m.id, m.name, m.area),
      lastModified: m.updated ? new Date(m.updated) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
