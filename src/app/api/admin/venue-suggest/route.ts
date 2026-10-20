import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { suggestVenue } from "@/lib/venueSuggest";

/**
 * Suggest a venue's description, vibes, occasions and cuisines from its photos
 * and menu, and say which photos are not doing their job (venueSuggest.ts).
 * Admin only; writes nothing.
 */
export const maxDuration = 60;

const bodySchema = z.object({ venueId: z.string().uuid() });

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { data: venue } = await supabase
    .from("venues")
    .select("id,name,type,description,vibe_tags,best_for,image_url,gallery_urls,menu_shared_from,areas(name)")
    .eq("id", parsed.data.venueId)
    .maybeSingle();
  if (!venue) return NextResponse.json({ error: "No such venue." }, { status: 404 });
  const v = venue as unknown as {
    id: string;
    name: string;
    type: string;
    description: string | null;
    vibe_tags: string[] | null;
    best_for: string[] | null;
    image_url: string | null;
    gallery_urls: string[] | null;
    menu_shared_from: string | null;
    areas: { name: string } | null;
  };
  const { data: menu } = await supabase
    .from("menu_items")
    .select("name,category,price_ghs")
    .in("venue_id", [...new Set([v.id, v.menu_shared_from ?? v.id])])
    .limit(200);

  const r = await suggestVenue({
    name: v.name,
    type: v.type,
    area: v.areas?.name ?? "",
    description: v.description ?? "",
    vibe_tags: v.vibe_tags ?? [],
    best_for: v.best_for ?? [],
    photos: [...new Set([v.image_url, ...(v.gallery_urls ?? [])].filter((u): u is string => Boolean(u)))],
    menu: ((menu ?? []) as { name: string; category: string; price_ghs: number }[]).map((m) => ({ ...m, price_ghs: Number(m.price_ghs) })),
  });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.reason === "limit" ? 429 : 502 });
  return NextResponse.json({ ...r.data, model: r.model });
}
