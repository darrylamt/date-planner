import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Google may read the public pages; the admin, venue and staff areas and the API are not for it. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/vendor", "/venue", "/staff", "/auth", "/login"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
