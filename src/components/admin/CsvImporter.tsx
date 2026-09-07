"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { csvToObjects } from "@/lib/csv";
import { Toast } from "@/components/Toast";
import type { Area } from "@/lib/types";

/**
 * CSV import for venues and menu items.
 * Venues CSV headers:
 *   name,type,area,price_band,avg_cost_per_person_ghs,description,vibe_tags,best_for,
 *   reservation_required,dress_code,instagram_handle,phone,google_maps_url,image_url,lat,lng
 * Menu items CSV headers:
 *   venue,name,category,price_ghs,notes   (venue = exact venue name)
 */
export function CsvImporter({
  areas,
  venues,
}: {
  areas: Area[];
  venues: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"venues" | "menu_items">("venues");
  const [report, setReport] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setReport([]);
    const text = await file.text();
    const rows = csvToObjects(text);
    const log: string[] = [];
    let ok = 0;

    if (mode === "venues") {
      const areaByName = new Map(areas.map((a) => [a.name.toLowerCase(), a.id] as [string, string]));
      for (const [i, r] of rows.entries()) {
        const areaId = areaByName.get((r.area ?? "").toLowerCase());
        if (!r.name || !areaId) {
          log.push(`Row ${i + 2}: skipped — missing name or unknown area "${r.area}"`);
          continue;
        }
        const { error } = await supabase.from("venues").insert({
          name: r.name,
          type: r.type || "restaurant",
          area_id: areaId,
          price_band: r.price_band || "mid",
          avg_cost_per_person_ghs: Number(r.avg_cost_per_person_ghs) || 0,
          description: r.description || "",
          vibe_tags: (r.vibe_tags ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean),
          best_for: (r.best_for ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean),
          reservation_required: /^(true|yes|1)$/i.test(r.reservation_required ?? ""),
          dress_code: r.dress_code || null,
          instagram_handle: r.instagram_handle || null,
          // Imported numbers are proposals, never live. The reservation flow
          // dials `phone` under our own name, so it needs a human first.
          phone_pending: r.phone || null,
          phone_status: r.phone ? "pending" : "none",
          phone_source: "CSV import — unreviewed",
          google_maps_url: r.google_maps_url || null,
          image_url: r.image_url || null,
          lat: r.lat ? Number(r.lat) : null,
          lng: r.lng ? Number(r.lng) : null,
        });
        if (error) log.push(`Row ${i + 2} (${r.name}): ${error.message}`);
        else ok++;
      }
    } else {
      const venueByName = new Map(venues.map((v) => [v.name.toLowerCase(), v.id] as [string, string]));
      for (const [i, r] of rows.entries()) {
        const venueId = venueByName.get((r.venue ?? "").toLowerCase());
        if (!r.name || !venueId) {
          log.push(`Row ${i + 2}: skipped — missing item name or unknown venue "${r.venue}"`);
          continue;
        }
        const { error } = await supabase.from("menu_items").insert({
          venue_id: venueId,
          name: r.name,
          category: r.category || "other",
          price_ghs: Number(r.price_ghs) || 0,
          notes: r.notes || null,
        });
        if (error) log.push(`Row ${i + 2} (${r.name}): ${error.message}`);
        else ok++;
      }
    }

    log.unshift(`Imported ${ok} of ${rows.length} rows.`);
    setReport(log);
    setBusy(false);
    setToast(`Imported ${ok} rows`);
    setTimeout(() => setToast(null), 2000);
    router.refresh();
  }

  return (
    <div className="max-w-[720px]">
      <h1 className="font-display text-[24px] font-bold">Import CSV</h1>
      <div className="text-[14px] text-mutedbrown">
        Bulk-load venues or menu items. First row must be the header.
      </div>

      <div className="mt-5 flex gap-2.5">
        <button
          className={`chip ${mode === "venues" ? "chip-on" : ""}`}
          onClick={() => setMode("venues")}
        >
          Venues
        </button>
        <button
          className={`chip ${mode === "menu_items" ? "chip-on" : ""}`}
          onClick={() => setMode("menu_items")}
        >
          Menu items
        </button>
      </div>

      <div className="card mt-4 p-5">
        <div className="text-[14px] leading-relaxed text-cocoa">
          {mode === "venues" ? (
            <>
              <b>Headers:</b>{" "}
              <code className="font-mono text-[12.5px]">
                name,type,area,price_band,avg_cost_per_person_ghs,description,vibe_tags,best_for,reservation_required,dress_code,instagram_handle,phone,google_maps_url,image_url,lat,lng
              </code>
              <br />
              <span className="text-mutedbrown">
                vibe_tags / best_for are ;-separated. area must match an existing area name.
              </span>
            </>
          ) : (
            <>
              <b>Headers:</b>{" "}
              <code className="font-mono text-[12.5px]">venue,name,category,price_ghs,notes</code>
              <br />
              <span className="text-mutedbrown">venue must match an existing venue name exactly.</span>
            </>
          )}
        </div>

        <label className="btn btnsm mt-4 inline-flex w-fit cursor-pointer px-6">
          {busy ? "Importing…" : "Choose CSV file"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {report.length > 0 && (
        <div className="card mt-4 max-h-[320px] overflow-y-auto p-5 font-mono text-[13px] leading-relaxed text-cocoa">
          {report.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
