import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppOnly } from "@/components/shared/AppOnly";
import { createServiceClient } from "@/lib/supabase/server";

export const revalidate = 3600;

/** Only what the page shows: a stay, a closed place or a missing one is not shared. */
async function venueOf(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient()
    .from("venues")
    .select("name, type, image_url, is_active, areas(name, city)")
    .eq("id", id)
    .maybeSingle();
  const v = data as { name: string; type: string; image_url: string | null; is_active: boolean; areas: { name: string; city: string | null } | null } | null;
  if (!v || !v.is_active || v.type === "stay") return null;
  const where = v.areas ? [v.areas.name, v.areas.city && v.areas.city !== v.areas.name ? v.areas.city : null].filter(Boolean).join(", ") : null;
  return { name: v.name, image: v.image_url, where };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const v = await venueOf(params.id);
  const base: Metadata = { robots: { index: false, follow: false } };
  if (!v) return { ...base, title: "A place on Duro!" };
  const description = `${v.where ? `${v.where}. ` : ""}See it in Duro!`;
  return { ...base, title: v.name, description, openGraph: { title: v.name, description, images: v.image ? [v.image] : [] } };
}

/** A venue shared from the app (aduro://venue/<id>). */
export default async function SharedVenuePage({ params }: { params: { id: string } }) {
  const v = await venueOf(params.id);
  if (!v) notFound();
  return <AppOnly eyebrow="A place on Duro!" name={v.name} where={v.where} image={v.image} appPath={`venue/${params.id}`} />;
}
