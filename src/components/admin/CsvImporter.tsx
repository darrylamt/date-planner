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

    /*
     * Rows are collected and written in batches.
     *
     * This used to be one insert per row inside the loop, so a 106-line menu
     * was 106 round trips to Supabase and a 600-line one was 600. On a
     * connection in Accra that is most of a minute of waiting for work the
     * database does in well under a second.
     */
    const pending: { row: number; values: Record<string, unknown> }[] = [];

    /**
     * Write in chunks, and fall back to one at a time only where it breaks.
     *
     * A batch insert reports one error for the whole batch and does not say
     * which row caused it, which would have thrown away the per-row messages
     * that make this screen usable. So a failing chunk is retried row by row:
     * the fast path stays fast, and the slow path only runs over rows that are
     * actually wrong.
     */
    async function insertInChunks(
      table: "venues" | "menu_items",
      items: { row: number; values: Record<string, unknown> }[],
      out: string[]
    ): Promise<number> {
      const SIZE = 250;
      let written = 0;

      for (let at = 0; at < items.length; at += SIZE) {
        const chunk = items.slice(at, at + SIZE);
        const { error } = await supabase.from(table).insert(chunk.map((c) => c.values));
        if (!error) {
          written += chunk.length;
          continue;
        }

        for (const one of chunk) {
          const { error: rowError } = await supabase.from(table).insert(one.values);
          if (rowError) {
            out.push(`Row ${one.row} (${String(one.values.name)}): ${rowError.message}`);
          } else {
            written += 1;
          }
        }
      }
      return written;
    }

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
        pending.push({
          row: i + 2,
          values: {
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
          },
        });
      }

      ok += await insertInChunks("venues", pending, log);
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

        /*
         * Optional columns. A spreadsheet of food will not have them and does
         * not need them; an arcade price list lives or dies on covers_people,
         * because a GHS 30 foosball table billed per head charges a couple 60.
         */
        const num = (raw: string | undefined): number | null => {
          const n = Number((raw ?? "").trim());
          return raw && raw.trim() !== "" && Number.isFinite(n) ? n : null;
        };

        pending.push({
          row: i + 2,
          values: {
            venue_id: venueId,
            name: r.name,
            category,
            price_ghs: Number(r.price_ghs) || 0,
            notes: r.notes || null,
            covers_people: Math.max(1, num(r.covers_people) ?? 1),
            min_players: num(r.min_players),
            max_players: num(r.max_players),
            duration_minutes: num(r.duration_minutes),
            min_age: num(r.min_age),
            requires_gear: r.requires_gear || null,
          },
        });
      }

      ok += await insertInChunks("menu_items", pending, log);
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
                Activity lists may add{" "}
                <code className="font-mono text-[12px]">
                  covers_people,min_players,max_players,duration_minutes,min_age,requires_gear
                </code>
                . covers_people is how many people one price covers, so a GHS 30
                foosball table for two is 30 with covers_people 2, not 30 each.
              </span>
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
