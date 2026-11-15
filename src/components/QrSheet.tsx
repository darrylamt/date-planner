import QRCode from "qrcode";
import { SITE_URL } from "@/lib/site";
import { tidyName } from "@/lib/nudges";

/** The deep green of the owner's sticker artwork (13 Nov 2026). */
const BRAND_GREEN = "#0B5A3E";

/** A venue's short sticker address: /q/<first 8 of its id>, which counts the scan and opens its menu page. */
export const stickerUrl = (venueId: string) => `${SITE_URL}/q/${venueId.slice(0, 8)}`;

/*
 * A venue's QR stickers on one A4 sheet (owner, 13 Nov 2026), shared by the
 * admin and the venue portal. Small: 12 stickers of 60 x 66 mm. Large: 4
 * table cards of 90 x 128 mm. Printing shows only the sheet.
 */
export async function QrSheet({ venueId, venueName, large }: { venueId: string; venueName: string; large: boolean }) {
  // Error correction Q: still reads with a scuff or a drop of sauce, and stays simple.
  const svg = await QRCode.toString(stickerUrl(venueId), { type: "svg", errorCorrectionLevel: "Q", margin: 0, color: { dark: "#111111", light: "#ffffff" } });
  const count = large ? 4 : 12;
  const name = tidyName(venueName);
  return (
    <>
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
      <div className="overflow-auto rounded-lg bg-white p-[8mm] shadow-sm ring-1 ring-black/10" style={{ width: "210mm", maxWidth: "100%" }}>
        <div className="qr-sheet">
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="qr-sticker">
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
                {large ? `${name} · Plan your night with Duro!` : name}
              </div>
              {large ? <div style={{ marginTop: "2mm", fontSize: "3.2mm", color: "#777" }}>duroplans.com</div> : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
