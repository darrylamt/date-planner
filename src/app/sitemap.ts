import type { MetadataRoute } from "next";
import { createCatalogClient } from "@/lib/supabase/server";
import { listedMenus, menuUrl } from "@/lib/menuPage";
import { SITE_URL } from "@/lib/site";

/** For Google: the home page, the blog, and every menu worth a page (menuPage.ts). Rebuilt once a day. */
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createCatalogClient();
  const menus = await listedMenus(db).catch(() => []);
  // The blog (0116): newest first, a thousand at most.
  const { data: posts } = await db.from("blog_posts").select("slug, published_at").eq("status", "published").order("published_at", { ascending: false }).limit(1000);
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/support`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/blog`, changeFrequency: "daily", priority: 0.6 },
    ...((posts ?? []) as { slug: string; published_at: string }[]).map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.published_at),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...menus.map((m) => ({
      url: menuUrl(m.id, m.name, m.area),
      lastModified: m.updated ? new Date(m.updated) : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
