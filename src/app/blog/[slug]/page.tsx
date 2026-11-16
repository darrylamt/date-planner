import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createCatalogClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { storeLink } from "@/lib/links";
import type { BlogBody } from "@/lib/blog";

/*
 * One blog post (0116). The names, areas, prices and links on it are put in
 * by our code from the catalogue; the sentences around them are Gemini's,
 * written from those facts only (src/lib/blog.ts).
 */
export const revalidate = 3600;

type Post = { slug: string; title: string; description: string; body: BlogBody; hero_image: string | null; published_at: string; status: string };

async function load(slug: string): Promise<Post | null> {
  const { data } = await createCatalogClient().from("blog_posts").select("slug, title, description, body, hero_image, published_at, status").eq("slug", slug).maybeSingle();
  const p = data as Post | null;
  return p && p.status === "published" ? p : null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p) return { title: "Duro! blog" };
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `${SITE_URL}/blog/${p.slug}` },
    openGraph: { title: p.title, description: p.description, type: "article", ...(p.hero_image ? { images: [p.hero_image] } : {}) },
  };
}

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const p = await load(params.slug);
  if (!p) notFound();
  const { body } = p;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    description: p.description,
    datePublished: p.published_at,
    ...(p.hero_image ? { image: p.hero_image } : {}),
    publisher: { "@type": "Organization", name: "Duro!", url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${p.slug}`,
  };

  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex items-center justify-between">
        <Logo size={26} href="/" />
        <Link href="/blog" className="text-[14px] font-semibold text-flame">
          All posts
        </Link>
      </div>
      <div className="mt-8 text-[12px] font-semibold uppercase tracking-[0.08em] text-mutedbrown">
        {new Date(p.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </div>
      <h1 className="mt-1 font-display text-[32px] font-bold leading-tight">{p.title}</h1>
      <p className="mt-4 text-[17px] leading-relaxed">{body.intro}</p>

      <div className="mt-8 grid gap-8">
        {body.items.map((it, i) => (
          <section key={i}>
            {it.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image} alt={it.heading} loading={i ? "lazy" : "eager"} className="mb-3 aspect-[16/9] w-full rounded-2xl object-cover" />
            ) : null}
            <h2 className="text-[22px] font-bold leading-snug">
              {it.link ? (
                <Link href={it.link} className="hover:underline">
                  {it.heading}
                </Link>
              ) : (
                it.heading
              )}
            </h2>
            {it.facts ? <p className="mt-1 text-[14px] font-semibold text-mutedbrown">{it.facts}</p> : null}
            <p className="mt-2 text-[16px] leading-relaxed">{it.text}</p>
            {it.link ? (
              <Link href={it.link} className="mt-2 inline-block text-[14px] font-bold text-flame">
                Menu and prices ›
              </Link>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-line p-5">
        <p className="text-[16px] font-semibold">{body.outro}</p>
        <a href={storeLink("blog")} className="mt-3 inline-block rounded-full bg-flame px-5 py-2.5 text-[15px] font-bold text-white">
          Get Duro! free
        </a>
      </div>
      <p className="mt-6 text-[12px] text-mutedbrown">Prices are from each place&apos;s menu as Duro! holds it and can change. Tell us at support@duroplans.com if one is out of date.</p>
    </main>
  );
}
