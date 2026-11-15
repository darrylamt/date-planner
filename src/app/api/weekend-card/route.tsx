import { createCatalogClient } from "@/lib/supabase/server";
import { weekendPicks } from "@/lib/weekendPost";
import { weekendSpec } from "@/lib/socialPosts";
import { renderFlyer, type FlyerFormat, type FlyerTheme } from "@/lib/flyer";

/*
 * The weekend post's pictures: ?i=0 is the cover, a line per pick in the
 * shape of a lineup poster (owner, 15 Nov 2026); ?i=1..5 one pick each with
 * its photo. &theme= and &format= as the Flyer maker's. Built from the same
 * picks as Admin → Social, so the words and pictures agree. Catalogue data
 * only, so it stays public like the rest of the catalogue.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

const THEMES: FlyerTheme[] = ["rose", "night", "gold", "green"];
const FORMATS: FlyerFormat[] = ["post", "story", "square"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const i = Math.max(0, Math.min(5, Number(url.searchParams.get("i") ?? 0) || 0));
  const theme = THEMES.find((t) => t === url.searchParams.get("theme")) ?? "rose";
  const format = FORMATS.find((f) => f === url.searchParams.get("format")) ?? "post";
  const { days, picks } = await weekendPicks(createCatalogClient());

  const p = picks[i - 1];
  if (i === 0 || !p) return renderFlyer(weekendSpec(days, picks, theme, format), url.origin);
  return renderFlyer(
    {
      layout: "photo",
      theme,
      format,
      badge: `${i} of ${picks.length} · This weekend in Accra`,
      eyebrow: p.kind === "event" ? p.when : p.kind === "film" ? "At the cinema" : "Dinner any night",
      title: p.title,
      sub: p.where ?? undefined,
      chip: p.price ?? undefined,
      image: p.image,
    },
    url.origin
  );
}
