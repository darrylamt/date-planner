import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { adminDataClient } from "@/lib/adminAuth";
import { menuUrl } from "@/lib/menuPage";
import { SITE_URL } from "@/lib/site";
import { PrintButton } from "./PrintButton";
import { tidyName } from "@/lib/nudges";

export const dynamic = "force-dynamic";

/** The deep green of the owner's sticker artwork (13 Nov 2026). */
const BRAND_GREEN = "#0B5A3E";

/*
 * A venue's QR stickers on A4, to print or save as a PDF (owner, 13 Nov
 * 2026). Each code opens the venue's public menu page, with ?from=qr so a
 * scan can be told from a search visit later. Small: 12 stickers of
 * 60 x 66 mm. Large: 4 table cards of 90 x 128 mm.
 */
export default async function VenueQrPage({ params, searchParams }: { params: { id: string }; searchParams: { size?: string } }) {
  const db = await adminDataClient();
  const { data } = await db.from("venues").select("id, name, type, areas(name)").eq("id", params.id).maybeSingle();
  const v = data as unknown as { id: string; name: string; type: string; areas: { name: string } | null } | null;
  if (!v) notFound();
  const large = searchParams.size === "large";
  // The short address (src/app/q): a simpler code that scans from across a table. It opens the menu page.
  const url = `${SITE_URL}/q/${v.id.slice(0, 8)}`;
  const page = menuUrl(v.id, v.name, v.areas?.name);
  // Error correction Q: still reads with a scuff or a drop of sauce, and stays simple.
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 0, color: { dark: "#111111", light: "#ffffff" } });
  const count = large ? 4 : 12;

  return (
    <div className="max-w-[900px]">
      <style>{`
        @page { size: A4; margin: 8mm; }
        .qr-sheet { width: 194mm; display: grid; grid-template-columns: repeat(${large ? 2 : 3}, 1fr); gap: ${large ? "6mm" : "4mm"}; }
        .qr-sticker { border: 0.3mm dashed #bbb; border-radius: 6mm; height: ${large ? "128mm" : "66mm"}; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: ${large ? "8mm" : "3.5mm"}; background: #fff; color: #111; break-inside: avoid; }
        .qr-code svg { width: ${large ? "62mm" : "34mm"}; height: ${large ? "62mm" : "34mm"}; display: block; }
        @media print {
          body * { visibility: hidden !important; }
          .qr-sheet, .qr-sheet * { visibility: visible !important; }
          .qr-sheet { position: absolute; left: 0; top: 0; }
          .qr-sticker { border-color: #ddd; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/venues/${v.id}`} className="text-[13px] font-semibold text-flame">
            ← {v.name}
          </Link>
          <h1 className="mt-1">QR stickers</h1>
          <p className="mt-1 max-w-[620px] text-[14px] text-mutedbrown">
            Each code opens {v.name}&apos;s menu and prices on duroplans.com, with a button to plan a night there. Print on A4 sticker paper or card, or press
            Print and choose Save as PDF.
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

      <div className="mt-6 overflow-auto rounded-lg bg-white p-[8mm] shadow-sm ring-1 ring-black/10" style={{ width: "210mm" }}>
        <div className="qr-sheet">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="qr-sticker">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <div
                role="img"
                aria-label="Duro!"
                style={{
                  height: large ? "16mm" : "7.5mm",
                  width: large ? "43.8mm" : "20.5mm",
                  marginBottom: large ? "6mm" : "2.5mm",
                  backgroundColor: BRAND_GREEN,
                  WebkitMaskImage: "url(/brand/duro-wordmark.png)",
                  maskImage: "url(/brand/duro-wordmark.png)",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              />
              <div className="qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
              <div style={{ marginTop: large ? "6mm" : "2.5mm", fontWeight: 800, fontSize: large ? "6mm" : "3.3mm", lineHeight: 1.15 }}>
                {large ? "Scan for the menu and prices" : "Menu and prices"}
              </div>
              <div style={{ marginTop: "1mm", fontSize: large ? "4mm" : "2.6mm", color: "#444", lineHeight: 1.2 }}>
                {large ? `${tidyName(v.name)} · Plan your night with Duro!` : tidyName(v.name)}
              </div>
              {large ? <div style={{ marginTop: "2mm", fontSize: "3.2mm", color: "#777" }}>duroplans.com</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
