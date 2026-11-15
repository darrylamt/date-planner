import { z } from "zod";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/adminAuth";
import { renderFlyer, type FlyerSpec } from "@/lib/flyer";

/*
 * The Flyer maker's picture (Admin → Social). Staff with the social role, and
 * admins, only: a flyer carries the brand, so nobody outside can put words
 * under it. The spec comes as ?d=<base64url JSON>, so an <img> can preview it
 * and a link can download it.
 *
 * A photo is never a URL from the request. The spec names a venue or an
 * event, and its own catalogue picture is looked up here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shortened, not refused: a long name from the catalogue still draws (the renderer adds the …).
const text = (n: number) => z.string().transform((s) => s.trim().slice(0, n));
const common = {
  theme: z.enum(["rose", "night", "gold", "green"]).default("rose"),
  format: z.enum(["post", "story", "square"]).default("post"),
  eyebrow: text(60).optional(),
  cta: text(50).optional(),
};
const row = z.object({ date: text(16), title: text(60), day: text(12).optional(), sub: text(80).optional() });
const spec = z.discriminatedUnion("layout", [
  z.object({ ...common, layout: z.literal("list"), title: text(30), title2: text(30).optional(), sections: z.array(z.object({ heading: text(20).optional(), rows: z.array(row).max(24) })).max(4) }),
  z.object({
    ...common,
    layout: z.literal("photo"),
    title: text(70),
    sub: text(90).optional(),
    chip: text(50).optional(),
    badge: text(50).optional(),
    venueId: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
  }),
  z.object({ ...common, layout: z.literal("text"), title: text(50), title2: text(50).optional(), body: text(240).optional() }),
]);

export async function GET(req: Request) {
  const auth = await requireStaff(["social"]);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  let parsed: z.infer<typeof spec>;
  try {
    parsed = spec.parse(JSON.parse(Buffer.from(url.searchParams.get("d") ?? "", "base64url").toString("utf8")));
  } catch {
    return NextResponse.json({ error: "That flyer could not be read." }, { status: 400 });
  }

  let flyer: FlyerSpec;
  if (parsed.layout === "photo") {
    const { venueId, eventId, ...rest } = parsed;
    let image: string | null = null;
    if (eventId) {
      const { data } = await auth.supabase.from("events").select("image_url, venues(image_url)").eq("id", eventId).maybeSingle();
      const e = data as { image_url: string | null; venues: { image_url: string | null } | null } | null;
      image = e?.image_url ?? e?.venues?.image_url ?? null;
    } else if (venueId) {
      const { data } = await auth.supabase.from("venues").select("image_url").eq("id", venueId).maybeSingle();
      image = (data as { image_url: string | null } | null)?.image_url ?? null;
    }
    flyer = { ...rest, image };
  } else {
    flyer = parsed;
  }

  const res = await renderFlyer(flyer, url.origin);
  if (url.searchParams.get("download")) res.headers.set("content-disposition", `attachment; filename="duro-flyer-${Date.now()}.png"`);
  return res;
}
