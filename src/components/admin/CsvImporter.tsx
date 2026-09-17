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
  /*
   * What a file would do, held back until somebody says go.
   *
   * Choosing a file used to write it straight into the catalogue. There was no
   * way to see that a column had shifted, that every venue name had missed, or
   * that you had picked last week's file, until it was already in and the
   * report was the first you heard of it. Every check this screen already
   * performed ran before the insert; it simply did not stop to show anybody.
   */
  const [raw, setRaw] = useState("");
  const [staged, setStaged] = useState<{
    rows: { row: number; values: Record<string, unknown> }[];
    log: string[];
  } | null>(null);

  /**
   * Read a CSV, and either report what it would do or do it.
   *
   * One function for both so the preview cannot drift from the import: what
   * you are shown is produced by the code that writes, stopped one step
   * earlier, rather than by a second implementation that agrees with it today.
   */
  async function run(text: string, dryRun: boolean) {
    setBusy(true);
    setReport([]);
    if (dryRun) setStaged(null);
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

      if (dryRun) {
        setStaged({ rows: pending, log });
        setStaged(null);
    setRaw("");
    setReport(log);
        setBusy(false);
        return;
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

      if (dryRun) {
        setStaged({ rows: pending, log });
        setReport(log);
        setBusy(false);
        return;
      }

      /*
       * Re-importing a menu updates it. It used to insert blindly, so a second
       * CSV that repeated rows already on file added them again: Casa1715's
       * drinks list went in at 18:16 and again at 18:30 inside a file that had
       * gained the food, and the venue ended up with 446 drinks where it sells
       * 223. Nothing complained, because two rows with the same name are
       * perfectly legal.
       *
       * Matching on venue and name, case-insensitively, because that is what
       * a person means by "the same dish". A price that has changed is the
       * normal reason to re-import, so an existing row is updated rather than
       * skipped.
       */
      const venueIds = [...new Set(pending.map((p) => String(p.values.venue_id)))];
      const existing = new Map<string, string>();
      for (let at = 0; at < venueIds.length; at += 50) {
        const { data } = await supabase
          .from("menu_items")
          .select("id, venue_id, name")
          .in("venue_id", venueIds.slice(at, at + 50));
        for (const row of data ?? []) {
          existing.set(`${row.venue_id}::${(row.name ?? "").trim().toLowerCase()}`, row.id);
        }
      }

      const fresh: typeof pending = [];
      const revised: { id: string; values: Record<string, unknown> }[] = [];
      /* A file that repeats a dish within itself must not fight itself. */
      const seen = new Set<string>();

      for (const item of pending) {
        const k = `${item.values.venue_id}::${String(item.values.name).trim().toLowerCase()}`;
        if (seen.has(k)) {
          log.push(`Row ${item.row} (${String(item.values.name)}): listed twice in this file, kept once`);
          continue;
        }
        seen.add(k);

        const id = existing.get(k);
        if (id) revised.push({ id, values: item.values });
        else fresh.push(item);
      }

      ok += await insertInChunks("menu_items", fresh, log);

      let updated = 0;
      for (let at = 0; at < revised.length; at += 250) {
        const chunk = revised.slice(at, at + 250);
        const { error } = await supabase
          .from("menu_items")
          .upsert(chunk.map((c) => ({ id: c.id, ...c.values })), { onConflict: "id" });
        if (error) log.push(`Could not update ${chunk.length} existing rows: ${error.message}`);
        else updated += chunk.length;
      }
      if (updated) log.push(`${updated} item(s) already on file were updated rather than duplicated.`);
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

        {/* Paste or choose. Pasting is how most of these arrive. */}
        <textarea
          className="ta mt-4 min-h-[140px] font-mono text-[12.5px]"
          placeholder={"Paste the CSV here, header row first…"}
          value={raw}
          disabled={busy}
          onChange={(e) => setRaw(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button
            className="btn btnsm px-6"
            disabled={busy || !raw.trim()}
            onClick={() => void run(raw, true)}
          >
            {busy ? "Reading…" : "Check this file"}
          </button>

          <label className="btn2 btnsm inline-flex w-fit cursor-pointer px-5">
            Choose a file
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const text = await f.text();
                setRaw(text);
                // Straight into the check, never straight into the catalogue.
                void run(text, true);
              }}
            />
          </label>

          {raw.trim() && (
            <button
              className="text-[13px] font-semibold text-mutedbrown hover:text-flame"
              onClick={() => {
                setRaw("");
                setStaged(null);
                setReport([]);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/*
        What it would write, before it writes it.
        *
        * The rows shown are the ones that passed every check, built by the
        * same code that does the inserting, so this cannot drift from what
        * actually happens. Rows with problems are not here: they are in the
        * report below, with the reason and the line number.
      */}
      {staged && (
        <div className="card mt-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[18px] font-bold">
              {staged.rows.length} row{staged.rows.length === 1 ? "" : "s"} ready
            </h2>
            {staged.log.length > 0 && (
              <span className="text-[13px] text-staletext">
                {staged.log.length} line{staged.log.length === 1 ? "" : "s"} need attention
              </span>
            )}
          </div>

          {staged.rows.length === 0 ? (
            <p className="mt-2 text-[14px] text-mutedbrown">
              Nothing here would be written. The report below says why, line by line.
            </p>
          ) : (
            <>
              <div className="mt-3 max-h-[420px] overflow-auto">
                <table className="tbl w-full border-collapse">
                  <thead>
                    <tr>
                      <th>Line</th>
                      {Object.keys(staged.rows[0].values)
                        .filter((k) => k !== "venue_id")
                        .map((k) => (
                          <th key={k}>{k.replace(/_/g, " ")}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staged.rows.slice(0, 200).map((r) => (
                      <tr key={r.row}>
                        <td className="font-mono text-[12.5px] text-mutedbrown">{r.row}</td>
                        {Object.entries(r.values)
                          .filter(([k]) => k !== "venue_id")
                          .map(([k, val]) => (
                            <td key={k} className="whitespace-nowrap">
                              {val === null || val === "" ? (
                                <span className="text-mutedbrown">—</span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {staged.rows.length > 200 && (
                <p className="mt-2 text-[13px] text-mutedbrown">
                  Showing the first 200. All {staged.rows.length} would be written.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="btn btnsm px-6"
                  disabled={busy}
                  onClick={() => void run(raw, false)}
                >
                  {busy ? "Importing…" : `Import ${staged.rows.length} rows`}
                </button>
                <span className="text-[13px] text-mutedbrown">
                  Re-importing a menu updates the prices already on file rather than adding the
                  dishes twice.
                </span>
              </div>
            </>
          )}
        </div>
      )}

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
