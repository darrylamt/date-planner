"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import type { MenuItem } from "@/lib/types";

/**
 * Bulk price quick-edit, matching the designed table:
 * Tab moves down the price column · Enter saves the row · Esc reverts.
 */
export function BulkPriceEditor({
  venues,
  venueId,
  venueName,
  items,
  staleDays,
}: {
  venues: { id: string; name: string }[];
  venueId: string | null;
  venueName: string;
  items: MenuItem[];
  staleDays: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const original = useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, Number(i.price_ghs)])),
    [items]
  );
  const [prices, setPrices] = useState<Record<string, number>>(original);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const changed = items.filter((i) => prices[i.id] !== original[i.id]);
  const isStale = staleDays === null || staleDays > 90;

  async function saveRow(item: MenuItem) {
    const { error } = await supabase
      .from("menu_items")
      .update({ price_ghs: prices[item.id] })
      .eq("id", item.id);
    if (!error) {
      setToast(`Saved ${item.name}`);
      setTimeout(() => setToast(null), 1600);
    }
  }

  async function saveAll() {
    setBusy(true);
    // Touch every row (even unchanged) so the venue is marked fresh.
    for (const item of items) {
      await supabase.from("menu_items").update({ price_ghs: prices[item.id] }).eq("id", item.id);
    }
    setBusy(false);
    setToast("All prices saved, marked fresh");
    setTimeout(() => setToast(null), 2000);
    router.refresh();
  }

  return (
    <div className="max-w-[860px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">
            Bulk price edit{venueName ? `, ${venueName}` : ""}
          </h1>
          <div className="text-[14px] text-mutedbrown">
            Tab moves down the price column · Enter saves the row · Esc reverts
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {isStale ? (
            <span className="badge b-stale">Stale{staleDays !== null ? ` · ${staleDays}d` : ""}</span>
          ) : (
            <span className="badge b-ok">Fresh</span>
          )}
          <button className="btn btnsm !bg-lagoon hover:!bg-lagoon-mid" onClick={saveAll} disabled={busy || !venueId}>
            {busy ? "Saving…" : "Save all & mark fresh"}
          </button>
        </div>
      </div>

      <select
        className="inp mt-5 h-[42px] max-w-[320px]"
        value={venueId ?? ""}
        onChange={(e) => router.push(`/admin/prices?venue=${e.target.value}`)}
      >
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>

      <div className="mt-4 overflow-x-auto">
        <table className="tbl w-full max-w-[820px]">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Last price</th>
              <th>New price (GHS)</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const oldP = original[item.id];
              const newP = prices[item.id];
              const delta = oldP > 0 ? ((newP - oldP) / oldP) * 100 : 0;
              const dirty = newP !== oldP;
              return (
                <tr key={item.id}>
                  <td className="font-bold">{item.name}</td>
                  <td className="capitalize">{item.category}</td>
                  <td className="font-mono text-mutedbrown">{oldP.toFixed(2)}</td>
                  <td>
                    <input
                      ref={(el) => {
                        inputRefs.current[idx] = el;
                      }}
                      className={`pinp ${dirty ? "border-flame ring-[3px] ring-flame/15" : ""}`}
                      type="number"
                      step="0.5"
                      value={Number.isFinite(newP) ? newP : 0}
                      onChange={(e) =>
                        setPrices((p) => ({ ...p, [item.id]: Number(e.target.value) }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveRow(item);
                        } else if (e.key === "Escape") {
                          setPrices((p) => ({ ...p, [item.id]: oldP }));
                        } else if (e.key === "Tab" && !e.shiftKey) {
                          e.preventDefault();
                          inputRefs.current[idx + 1]?.focus();
                          inputRefs.current[idx + 1]?.select();
                        }
                      }}
                    />
                  </td>
                  <td className={`font-bold ${dirty ? "text-flame" : "text-mutedbrown"}`}>
                    {dirty ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%` : ", "}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-mutedbrown">
                  This venue has no menu items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3.5 text-[14px] text-mutedbrown">
        {changed.length > 0 ? `${changed.length} rows changed · unsaved` : "No unsaved changes"}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
