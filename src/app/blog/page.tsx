import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { createCatalogClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

/*
 * The blog's front page (0116): the newest posts first. A new post appears
 * within the hour; the daily job writes one each morning (src/lib/blog.ts).
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Duro! blog: where to go in Accra",
  description: "Date night ideas, cheap eats, cafés and what's on in Accra, with real prices from each menu.",
  alternates: { canonical: `${SITE_URL}/blog` },
};

type Row = { slug: string; title: string; description: string; hero_image: string | null; published_at: string };

export default async function BlogIndex() {
  const { data } = await createCatalogClient()
    .from("blog_posts")
    .select("slug, title, description, hero_image, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(60);
  const posts = (data ?? []) as Row[];

  return (
    <main className="mx-auto w-full max-w-[760px] px-6 py-12">
      <Logo size={26} href="/" />
      <h1 className="mt-8 font-display text-[34px] font-bold leading-tight">Where to go in Accra</h1>
      <p className="mt-2 text-body text-mutedbrown">Date nights, cheap eats, cafés and what&apos;s on, with real prices from each menu.</p>
      <div className="mt-8 grid gap-4">
        {posts.length ? (
          posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="flex gap-4 rounded-2xl border border-line p-3 hover:bg-black/[0.03]">
              {p.hero_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.hero_image} alt="" loading="lazy" className="h-[84px] w-[84px] shrink-0 rounded-xl object-cover" />
              ) : null}
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-mutedbrown">
                  {new Date(p.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                <h2 className="mt-0.5 text-[18px] font-bold leading-snug">{p.title}</h2>
                <p className="mt-1 line-clamp-2 text-[14px] text-mutedbrown">{p.description}</p>
              </div>
            </Link>
          ))
        ) : (
          <p className="text-mutedbrown">The first post is on its way.</p>
        )}
      </div>
    </main>
  );
}
