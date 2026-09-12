"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureAreaId } from "@/lib/areas";
import { csvToObjects } from "@/lib/csv";
import { Toast } from "@/components/Toast";
import { MENU_CATEGORIES, normaliseCategory } from "@/lib/catalog";
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
    const mapped = new Map<string, string>();
    let ok = 0;

    if (mode === "venues") {
      // Areas are created on demand, so a spreadsheet can introduce a new
      // neighbourhood without a separate trip to /admin/areas first.
      const areaByName = new Map(areas.map((a) => [a.name.toLowerCase(), a.id] as [string, string]));

      async function areaIdFor(name: string): Promise<string | null> {
        const key = (name ?? "").trim().toLowerCase();
        if (!key) return null;
        const known = areaByName.get(key);
        if (known) return known;
        const resolved = await ensureAreaId(supabase, name);
        if (!resolved) return null;
        areaByName.set(key, resolved.id);
        if (resolved.created) log.push(`Created area "${name.trim()}"`);
        return resolved.id;
      }
      for (const [i, r] of rows.entries()) {
        const areaId = await areaIdFor(r.area ?? "");
        if (!r.name || !areaId) {
          log.push(`Row ${i + 2}: skipped, missing name or unknown area "${r.area}"`);
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
          phone_source: "CSV import, unreviewed",
          google_maps_url: r.google_maps_url || null,
          image_url: r.image_url || null,
          lat: r.lat ? Number(r.lat) : null,
          lng: r.lng ? Number(r.lng) : null,
        });
        if (error) log.push(`Row ${i + 2} (${r.name}): ${error.message}`);
        else ok++;
      }
    } else {
      const venueByName = new Map(
        venues.map((v) => [v.name.trim().toLowerCase(), v.id] as [string, string])
      );

      /*
       * Matching is an exact name match, lower-cased and trimmed. No fuzzy
       * matching on purpose: guessing that "Tea Baa" meant "Tea Baa GH" is the
       * kind of helpfulness that silently files a hundred dishes under the
       * wrong restaurant. When it misses, the nearest names are offered so the
       * fix is obvious rather than a hunt.
       */
      const nearest = (typed: string): string => {
        const key = typed.trim().toLowerCase();
        if (!key) return "";
        const close = venues
          .map((v) => v.name)
          .filter((n) => {
            const low = n.toLowerCase();
            return low.includes(key) || key.includes(low);
          })
          .slice(0, 3);
        return close.length ? `. Did you mean ${close.join(", ")}?` : "";
      };

      for (const [i, r] of rows.entries()) {
        const venueId = venueByName.get((r.venue ?? "").trim().toLowerCase());
        if (!r.name) {
          log.push(`Row ${i + 2}: skipped, no item name`);
          continue;
        }
        if (!venueId) {
          log.push(`Row ${i + 2}: no venue called "${r.venue}"${nearest(r.venue ?? "")}`);
          continue;
        }

        /*
         * A spreadsheet says "Burgers"; the enum says "main". Sending the raw
         * text failed every row with a Postgres enum error that told nobody
         * what to change.
         */
        const category = normaliseCategory(r.category);
        if (!category) {
          log.push(
            `Row ${i + 2} (${r.name}): "${r.category}" is not a category we know. ` +
              `Use one of ${MENU_CATEGORIES.join(", ")}.`
          );
          continue;
        }
        // Reading "Burgers" as a main is a guess, and a guess belongs on the
        // screen rather than quietly in the data.
        if (r.category && r.category.trim().toLowerCase() !== category) {
          mapped.set(r.category.trim(), category);
        }

        const { error } = await supabase.from("menu_items").insert({
          venue_id: venueId,
          name: r.name,
          category,
          price_ghs: Number(r.price_ghs) || 0,
          notes: r.notes || null,
        });
        if (error) log.push(`Row ${i + 2} (${r.name}): ${error.message}`);
        else ok++;
      }
    }

    if (mapped.size) {
      log.push("");
      log.push("Headings read as:");
      for (const [from, to] of mapped) log.push(`  ${from} → ${to}`);
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
              <span className="text-mutedbrown">
                venue must match an existing venue name exactly. Category is
                forgiving: Main, Mains, Starters, Drinks and the like all land in
                the right place.
              </span>
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
