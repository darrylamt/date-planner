import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppOnly } from "@/components/shared/AppOnly";
import { createServiceClient } from "@/lib/supabase/server";
import { photoCredit, type Destination } from "@/lib/trips";

export const revalidate = 3600;

async function placeOf(slug: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const { data } = await createServiceClient().from("destinations").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
  return (data as Destination | null) ?? null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const d = await placeOf(params.slug);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!d) return { ...base, title: "A trip on Duro!" };
  const description = `${d.region}. Plan a trip there in Duro!`;
  return { ...base, title: d.name, description, openGraph: { title: d.name, description, images: d.hero_image ? [d.hero_image] : [] } };
}

/** A Trips destination shared from the app (aduro://trip/place/<slug>). */
export default async function SharedPlacePage({ params }: { params: { slug: string } }) {
  const d = await placeOf(params.slug);
  if (!d) notFound();
  return (
    <AppOnly
      eyebrow="A trip on Duro!"
      name={d.name}
      where={`${d.region} region`}
      image={d.hero_image}
      credit={photoCredit(d)}
      appPath={`trip/place/${d.slug}`}
    />
  );
}
