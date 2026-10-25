import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { VenuePhotos } from "@/components/admin/VenuePhotos";

export const dynamic = "force-dynamic";

/** One venue's pictures: the cover, the gallery and how the place looks. Nothing else. */
export default async function VenuePhotosPage({ params }: { params: { id: string } }) {
  const supabase = await adminDataClient(["photos"]);
  const { data: v } = await supabase
    .from("venues")
    .select("id, name, image_url, gallery_urls, aesthetics, instagram_handle, google_maps_url, areas(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!v) notFound();
  const venue = v as any;

  return (
    <div className="max-w-[860px]">
      <Link href="/admin/photos" className="text-[13px] text-mutedbrown hover:underline">
        ← Photos
      </Link>
      <h1 className="mt-2">{venue.name}</h1>
      <p className="text-[14px] text-mutedbrown">
        {venue.areas?.name ?? ""}
        {venue.instagram_handle ? (
          <>
            {" · "}
            <a
              className="underline"
              href={`https://instagram.com/${String(venue.instagram_handle).replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              Their Instagram
            </a>
          </>
        ) : null}
        {venue.google_maps_url ? (
          <>
            {" · "}
            <a className="underline" href={venue.google_maps_url} target="_blank" rel="noreferrer">
              Google Maps photos
            </a>
          </>
        ) : null}
      </p>
      <VenuePhotos
        venueId={venue.id}
        initial={{
          image_url: venue.image_url ?? "",
          gallery_urls: Array.isArray(venue.gallery_urls) ? venue.gallery_urls : [],
          aesthetics: venue.aesthetics ?? null,
        }}
      />
    </div>
  );
}
