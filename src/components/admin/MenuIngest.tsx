"use client";

import { useState } from "react";
import { ghs } from "@/lib/format";
import { buildVenueMigration, migrationFilename } from "@/lib/sqlgen";
import {
  MENU_CATEGORIES,
  VENUE_TYPES,
  type IngestedItem,
  type IngestedVenue,
} from "@/lib/catalog";
import type { Area } from "@/lib/types";

/**
 * The venue shape here comes from ../../lib/catalog rather than being
 * hand-copied, because a hand-copied shape is exactly what went stale the
 * last time this schema changed: pricing_mode and unit_price_ghs were added
 * to IngestedVenue and this file kept compiling against an old copy of it
 * that had neither, so the fields the server actually returned were silently
 * unreachable here.
 */
interface Extracted {
  venue: IngestedVenue;
  items: IngestedItem[];
  warnings: string[];
  detected_currency: string | null;
  suggested_avg_cost: number;
}

/** Longer than the server's own budget, so the server's error wins when it can. */
const CLIENT_TIMEOUT_MS = 150_000;

/** Strip the data: prefix — the API takes raw base64. */
function toBase64(file: File): Promise<{ mediaType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ mediaType: file.type, data: url.slice(url.indexOf(",") + 1) });
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Menu → migration. An admin gives a name, an area and either a menu link or
 * photos; the model reads the menu, and everything it extracted is editable
 * before the SQL is generated. Nothing is written to the database from here —
 * the output is a migration the admin runs themselves.
 */
export function MenuIngest({ areas }: { areas: Area[] }) {
  const [venueName, setVenueName] = useState("");
  const [areaName, setAreaName] = useState(areas[0]?.name ?? "");
  const [venueType, setVenueType] = useState<string>("restaurant");
  const [menuUrl, setMenuUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Extracted | null>(null);
  const [avgCost, setAvgCost] = useState(0);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Notes alone are enough: an entry fee or an hourly rate is often just a
  // number the admin already knows, and there is no photo of a padel court's
  // price board sitting in an inbox waiting to be uploaded for it.
  const canSubmit =
    venueName.trim().length > 0 &&
    areaName &&
    (files.length > 0 || menuUrl.trim() || notes.trim().length > 0);

  async function extract() {
    setBusy(true);
    setError(null);
    setData(null);
    setCopied(false);
    setElapsed(0);

    // Without this the button spins forever when the server is killed
    // mid-request, which is indistinguishable from "still working".
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    const ticker = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const images = await Promise.all(files.map(toBase64));
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueName: venueName.trim(),
          areaName,
          venueType,
          menuUrl: menuUrl.trim(),
          notes: notes.trim(),
          images,
        }),
        signal: controller.signal,
      });

      // A killed serverless function returns an HTML error page, not JSON.
      const raw = await res.text();
      let json: (Extracted & { error?: string }) | null = null;
      try {
        json = JSON.parse(raw);
      } catch {
        setError(
          res.status === 504 || res.status === 502
            ? "The server gave up before the menu was read. Try fewer images, or use the menu link on its own."
            : `The server returned an unexpected response (${res.status}).`
        );
        return;
      }

      if (!res.ok) {
        setError(json?.error ?? "Extraction failed.");
        return;
      }
      setData(json as Extracted);
      setAvgCost((json as Extracted).suggested_avg_cost ?? 0);
    } catch (e) {
      setError(
        (e as Error)?.name === "AbortError"
          ? "That took too long and was stopped. Try fewer images at once, or paste the menu link instead."
          : "Could not reach the server."
      );
    } finally {
      clearTimeout(timer);
      clearInterval(ticker);
      setBusy(false);
    }
  }

  function updateItem(index: number, patch: Partial<IngestedItem>) {
    if (!data) return;
    const items = data.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    setData({ ...data, items });
  }

  function removeItem(index: number) {
    if (!data) return;
    setData({ ...data, items: data.items.filter((_, i) => i !== index) });
  }

  const sql = data
    ? buildVenueMigration(
        {
          name: data.venue.name,
          type: data.venue.type,
          areaName,
          price_band: data.venue.price_band,
          avg_cost_per_person_ghs: avgCost,
          pricing_mode: data.venue.pricing_mode,
          unit_price_ghs: data.venue.pricing_mode === "per_person" ? null : data.venue.unit_price_ghs,
          description: data.venue.description,
          vibe_tags: data.venue.vibe_tags,
          best_for: data.venue.best_for,
          dress_code: data.venue.dress_code,
          reservation_required: data.venue.reservation_required,
          instagram_handle: data.venue.instagram_handle,
          phone: data.venue.phone,
          google_maps_url: data.venue.google_maps_url,
          // Added later by editing the venue, per the admin workflow.
          image_url: null,
          lat: data.venue.lat,
          lng: data.venue.lng,
        },
        data.items
      )
    : "";

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ── Input ── */}
      <div className="card px-5 py-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className="flbl">Venue name</span>
            <input
              className="inp"
              placeholder="e.g. Republic Bar &amp; Grill"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
          </div>
          <div>
            <span className="flbl">Area</span>
            <input
              className="inp"
              list="known-areas"
              placeholder="Osu, or type a new one"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
            />
            <datalist id="known-areas">
              {areas.map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
            <div className="mt-1 text-[12.5px] text-mutedbrown">
              Pick one or type a new neighbourhood — it gets created with the venue.
            </div>
          </div>
          <div>
            <span className="flbl">Type</span>
            <select
              className="inp"
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
            >
              {VENUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="flbl">Link to prices (optional)</span>
            <input
              className="inp"
              placeholder="https://…"
              value={menuUrl}
              onChange={(e) => setMenuUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <span className="flbl">Photos of prices (optional, up to 8)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="block w-full text-[14px] text-cocoa file:mr-3 file:rounded-btn file:border-0 file:bg-flame file:px-4 file:py-2 file:text-[14px] file:font-semibold file:text-blush"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))}
          />
          {files.length > 0 && (
            <div className="mt-2 text-[13px] text-mutedbrown">
              {files.length} image{files.length === 1 ? "" : "s"}:{" "}
              {files.map((f) => f.name).join(", ")}
            </div>
          )}
        </div>

        <div className="mt-4">
          <span className="flbl">Or just type the prices</span>
          <textarea
            className="ta"
            placeholder="Entry is GHS 30. Or: court is GHS 200/hour. Or: ignore the breakfast page."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <span className="mt-1 block text-[12px] text-mutedbrown">
            Enough on its own — no photo needed.
          </span>
        </div>

        <button className="btn mt-4" onClick={extract} disabled={!canSubmit || busy}>
          {busy ? "Reading…" : "Read prices"}
        </button>
        {busy && (
          <div className="mt-2 text-[13px] text-mutedbrown">
            Reading… {elapsed}s. Usually 20–45 seconds; giving up at{" "}
            {Math.round(CLIENT_TIMEOUT_MS / 1000)}s.
          </div>
        )}
        {error && <div className="why mt-3 not-italic text-staletext">{error}</div>}
      </div>

      {/* ── Review ── */}
      {data && (
        <>
          {data.detected_currency &&
            !/ghs|cedi|₵/i.test(data.detected_currency) && (
              <div className="card border border-staletext px-5 py-4 text-staletext">
                The menu appears to be priced in <b>{data.detected_currency}</b>, not
                cedis. The numbers below are as printed and have NOT been converted —
                fix them before running the migration.
              </div>
            )}

          {data.items.length === 0 && (
            <div className="card border border-staletext/50 px-5 py-4">
              <div className="text-[15px] font-bold text-staletext">
                No menu items were read
              </div>
              <p className="mt-1 text-[14px] leading-relaxed text-cocoa">
                {menuUrl.trim()
                  ? "That link could not be fetched — many venue sites block automated readers, and links straight to a PDF or image often fail. Screenshot or photograph the menu and upload it as images instead; that path is far more reliable."
                  : "Nothing readable was found in those images. Sharper, straight-on photos of one page at a time work best."}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-cocoa">
                You can still generate the migration below to create the venue
                without a menu — but the planner cannot build a food order from
                it until items exist.
              </p>
            </div>
          )}

          {data.warnings.length > 0 && (
            <div className="card px-5 py-4">
              <div className="text-[15px] font-bold">What it could not read</div>
              <ul className="mt-2 list-disc pl-5 text-[14px] text-cocoa">
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card px-5 py-5">
            <div className="text-[15px] font-bold">Venue</div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <span className="flbl">Name</span>
                <input
                  className="inp"
                  value={data.venue.name}
                  onChange={(e) =>
                    setData({ ...data, venue: { ...data.venue, name: e.target.value } })
                  }
                />
              </div>
              <div>
                <span className="flbl">How does it charge?</span>
                <select
                  className="inp"
                  value={data.venue.pricing_mode}
                  onChange={(e) =>
                    setData({
                      ...data,
                      venue: { ...data.venue, pricing_mode: e.target.value as never },
                    })
                  }
                >
                  <option value="per_person">Per person (menu or cover)</option>
                  <option value="per_hour">Per hour, shared by the group</option>
                  <option value="per_group">Flat, shared by the group</option>
                  <option value="per_hour_per_person">Per hour, each person</option>
                </select>
                {data.venue.pricing_mode === "per_person" ? (
                  <>
                    <input
                      className="inp mt-2 font-mono"
                      type="number"
                      value={avgCost}
                      onChange={(e) => setAvgCost(Number(e.target.value) || 0)}
                    />
                    <div className="mt-1 text-[12.5px] text-mutedbrown">
                      Drives which budgets this appears for.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[13px] text-mutedbrown">GHS</span>
                      <input
                        className="inp max-w-[140px] font-mono"
                        type="number"
                        value={data.venue.unit_price_ghs ?? ""}
                        onChange={(e) =>
                          setData({
                            ...data,
                            venue: {
                              ...data.venue,
                              unit_price_ghs: e.target.value === "" ? null : Number(e.target.value),
                            },
                          })
                        }
                      />
                      <span className="text-[13px] text-mutedbrown">
                        {data.venue.pricing_mode === "per_group" ? "in total" : "per hour"}
                      </span>
                    </div>
                    <div className="mt-1 text-[12.5px] text-mutedbrown">
                      One bill, split by however many go.
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4">
              <span className="flbl">Description</span>
              <textarea
                className="ta"
                value={data.venue.description}
                onChange={(e) =>
                  setData({
                    ...data,
                    venue: { ...data.venue, description: e.target.value },
                  })
                }
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px] text-mutedbrown">
              <span className="badge b-ok">{data.venue.price_band}</span>
              {data.venue.vibe_tags.map((t) => (
                <span key={t} className="badge b-ok">
                  {t}
                </span>
              ))}
              {data.venue.phone && (
                <span className="badge b-ok font-mono">{data.venue.phone}</span>
              )}
            </div>
          </div>

          <div className="card px-5 py-5">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold">
                Menu items ({data.items.length})
              </div>
              <div className="font-mono text-[14px] text-mutedbrown">
                {data.items.length > 0 &&
                  `${ghs(Math.min(...data.items.map((i) => i.price_ghs)))} – ${ghs(
                    Math.max(...data.items.map((i) => i.price_ghs))
                  )}`}
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="tbl w-full border-collapse">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Price (GHS)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          className="inp h-[38px]"
                          value={it.name}
                          onChange={(e) => updateItem(i, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="inp h-[38px]"
                          value={it.category}
                          onChange={(e) =>
                            updateItem(i, {
                              category: e.target.value as IngestedItem["category"],
                            })
                          }
                        >
                          {MENU_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="inp h-[38px] w-[110px] font-mono"
                          type="number"
                          value={it.price_ghs}
                          onChange={(e) =>
                            updateItem(i, { price_ghs: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="font-semibold text-staletext"
                          onClick={() => removeItem(i)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-mutedbrown">
                        No items were extracted.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-bold">Migration</div>
                <div className="font-mono text-[12.5px] text-mutedbrown">
                  {migrationFilename(data.venue.name)}
                </div>
              </div>
              <button
                className="btn btnsm"
                onClick={async () => {
                  await navigator.clipboard.writeText(sql);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }}
              >
                {copied ? "Copied ✓" : "Copy SQL"}
              </button>
            </div>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-card bg-sand p-4 font-mono text-[12px] leading-relaxed text-cocoa">
              {sql}
            </pre>
            <div className="mt-3 text-[13px] text-mutedbrown">
              Paste into the Supabase SQL editor. Nothing has been written yet. Add the
              venue photo afterwards by editing it at <b>/admin/venues</b>.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
