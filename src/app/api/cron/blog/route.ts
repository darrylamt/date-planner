import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { writeDailyPost, type BlogKind } from "@/lib/blog";

/**
 * The daily blog post (src/lib/blog.ts), 06:00 every day from vercel.json.
 * With the cron secret, ?dry=1 writes nothing and returns the draft;
 * &kind= picks the topic whatever the day.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: BlogKind[] = ["cheap-eats", "date-night", "spotlight", "weekend", "coming-up", "cafes"];

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  const url = new URL(req.url);
  const kind = KINDS.find((k) => k === url.searchParams.get("kind"));
  const result = await writeDailyPost(createServiceClient(), new Date(), { dry: url.searchParams.get("dry") === "1", ...(kind ? { kind } : {}) });
  return NextResponse.json(result.ok ? { ok: true, slug: result.post.slug, title: result.post.title } : result);
}
