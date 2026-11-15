import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDataClient } from "@/lib/adminAuth";
import { menuUrl } from "@/lib/menuPage";
import { QrSheet, stickerUrl } from "@/components/QrSheet";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

/*
 * A venue's QR stickers on A4, to print or save as a PDF (owner, 13 Nov
 * 2026). The sheet itself is shared with the venue portal (QrSheet).
 */
export default async function VenueQrPage({ params, searchParams }: { params: { id: string }; searchParams: { size?: string } }) {
  const db = await adminDataClient();
  const { data } = await db.from("venues").select("id, name, type, areas(name)").eq("id", params.id).maybeSingle();
  const v = data as unknown as { id: string; name: string; type: string; areas: { name: string } | null } | null;
  if (!v) notFound();
  const large = searchParams.size === "large";
  const url = stickerUrl(v.id);
  const page = menuUrl(v.id, v.name, v.areas?.name);

  return (
    <div className="max-w-[900px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/venues/${v.id}`} className="text-[13px] font-semibold text-flame">
            ← {v.name}
          </Link>
          <h1 className="mt-1">QR stickers</h1>
          <p className="mt-1 max-w-[620px] text-[14px] text-mutedbrown">
            Each code opens {v.name}&apos;s menu and prices on duroplans.com, with a button to plan a night there. Print on A4 sticker paper or card, or press
            Print and choose Save as PDF. The venue can print these themselves too, from their portal (Menu → Share your menu).
          </p>
          <p className="mt-1 break-all text-[12px] text-mutedbrown">
            {url} opens{" "}
            <a href={page} target="_blank" rel="noopener" className="text-flame">
              {page}
            </a>
            . Scans are counted.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/venues/${v.id}/qr`} className={large ? "btn2 btnsm" : "btn btnsm"}>
            12 small
          </Link>
          <Link href={`/admin/venues/${v.id}/qr?size=large`} className={large ? "btn btnsm" : "btn2 btnsm"}>
            4 table cards
          </Link>
          <PrintButton />
        </div>
      </div>
      <div className="mt-6">
        <QrSheet venueId={v.id} venueName={v.name} large={large} />
      </div>
    </div>
  );
}
