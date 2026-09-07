"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import type { Area, MenuCategory, MenuItem, Venue } from "@/lib/types";

const TYPES = ["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert"] as const;
const BANDS = ["budget", "mid", "premium"] as const;
const VIBES = ["calm", "lively", "romantic", "fun", "adventurous", "scenic", "upscale", "casual"];
const BEST_FOR = ["first_date", "anniversary", "date_night", "friend_outing", "casual_hangout"];
const CATEGORIES: MenuCategory[] = ["starter", "main", "dessert", "drink", "other"];

type EditableItem = Partial<MenuItem> & { _tmpId: string; _deleted?: boolean };

/** Venue add/edit with inline menu items — built for “add a venue in under 2 minutes”. */
export function VenueForm({
  areas,
  venue,
  menuItems,
}: {
  areas: Area[];
  venue: Venue | null;
  menuItems: MenuItem[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [v, setV] = useState({
    name: venue?.name ?? "",
    type: venue?.type ?? "restaurant",
    area_id: venue?.area_id ?? areas[0]?.id ?? "",
    vibe_tags: venue?.vibe_tags ?? [],
    dress_code: venue?.dress_code ?? "",
    price_band: venue?.price_band ?? "mid",
    avg_cost_per_person_ghs: venue ? Number(venue.avg_cost_per_person_ghs) : 100,
    description: venue?.description ?? "",
    best_for: venue?.best_for ?? [],
    reservation_required: venue?.reservation_required ?? false,
    instagram_handle: venue?.instagram_handle ?? "",
    phone: venue?.phone ?? "",
    google_maps_url: venue?.google_maps_url ?? "",
    image_url: venue?.image_url ?? "",
    is_active: venue?.is_active ?? true,
    lat: venue?.lat != null ? String(venue.lat) : "",
    lng: venue?.lng != null ? String(venue.lng) : "",
  });

  const [items, setItems] = useState<EditableItem[]>(
    menuItems.map((m) => ({ ...m, _tmpId: m.id }))
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], val: string) =>
    list.includes(val) ? list.filter((x) => x !== val) : [...list, val];

  function addItem() {
    setItems((cur) => [
      ...cur,
      { _tmpId: `new-${Date.now()}-${cur.length}`, name: "", category: "main", price_ghs: 0 },
    ]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...v,
        dress_code: v.dress_code || null,
        instagram_handle: v.instagram_handle || null,
        // Even an admin edit routes through review, so approval happens in
        // exactly one place and is always recorded with who and when.
        phone_pending: v.phone || null,
        phone_status: v.phone ? "pending" : "none",
        phone_source: "admin edit — unreviewed",
        google_maps_url: v.google_maps_url || null,
        image_url: v.image_url || null,
        lat: v.lat === "" ? null : Number(v.lat),
        lng: v.lng === "" ? null : Number(v.lng),
      };

      let venueId = venue?.id;
      if (venueId) {
        const { error } = await supabase.from("venues").update(payload).eq("id", venueId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("venues")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        venueId = data.id;
      }

      for (const item of items) {
        const isNew = item._tmpId.startsWith("new-");
        if (item._deleted) {
          if (!isNew) await supabase.from("menu_items").delete().eq("id", item.id!);
          continue;
        }
        if (!item.name?.trim()) continue;
        const row = {
          venue_id: venueId,
          name: item.name,
          category: item.category ?? "other",
          price_ghs: Number(item.price_ghs) || 0,
          notes: item.notes || null,
        };
        if (isNew) {
          const { error } = await supabase.from("menu_items").insert(row);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("menu_items").update(row).eq("id", item.id!);
          if (error) throw error;
        }
      }

      setToast("Saved");
      setTimeout(() => router.push("/admin"), 700);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Save failed — are you an admin?");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!venue) return;
    if (!confirm(`Delete ${venue.name} and its menu?`)) return;
    setBusy(true);
    const { error } = await supabase.from("venues").delete().eq("id", venue.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  const field = "flex flex-col";

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-[24px] font-bold">
        {venue ? `Edit — ${venue.name}` : "Add venue"}
      </h1>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className={field}>
          <span className="flbl">Name</span>
          <input className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </div>
        <div className={field}>
          <span className="flbl">Area</span>
          <select
            className="inp"
            value={v.area_id}
            onChange={(e) => setV({ ...v, area_id: e.target.value })}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className={field}>
          <span className="flbl">Type</span>
          <select
            className="inp"
            value={v.type}
            onChange={(e) => setV({ ...v, type: e.target.value as (typeof TYPES)[number] })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className={field}>
          <span className="flbl">Price band</span>
          <select
            className="inp"
            value={v.price_band}
            onChange={(e) => setV({ ...v, price_band: e.target.value as (typeof BANDS)[number] })}
          >
            {BANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className={field}>
          <span className="flbl">Avg cost / person (GHS)</span>
          <input
            className="inp font-mono"
            type="number"
            value={v.avg_cost_per_person_ghs}
            onChange={(e) => setV({ ...v, avg_cost_per_person_ghs: Number(e.target.value) })}
          />
        </div>
        <div className={field}>
          <span className="flbl">Dress code (optional)</span>
          <input
            className="inp"
            value={v.dress_code}
            onChange={(e) => setV({ ...v, dress_code: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <span className="flbl">Description</span>
          <textarea
            className="ta"
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <span className="flbl">Vibe tags</span>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip px-3.5 py-2 text-[14px] ${v.vibe_tags.includes(t) ? "chip-on" : ""}`}
                onClick={() => setV({ ...v, vibe_tags: toggle(v.vibe_tags, t) })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <span className="flbl">Best for</span>
          <div className="flex flex-wrap gap-2">
            {BEST_FOR.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip px-3.5 py-2 text-[14px] ${v.best_for.includes(t) ? "chip-on" : ""}`}
                onClick={() => setV({ ...v, best_for: toggle(v.best_for, t) })}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        <div className={field}>
          <span className="flbl">Instagram</span>
          <input
            className="inp"
            placeholder="@handle"
            value={v.instagram_handle}
            onChange={(e) => setV({ ...v, instagram_handle: e.target.value })}
          />
        </div>
        <div className={field}>
          <span className="flbl">Phone</span>
          <input className="inp" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <div className="mt-1 text-[12.5px] text-mutedbrown">
            Saved as a proposal. It stays unusable until approved at{" "}
            <b className="text-ink">Phone review</b> — this number gets dialled
            under our name, so it never goes live on an edit alone.
          </div>
        </div>
        <div className={field}>
          <span className="flbl">Google Maps URL</span>
          <input
            className="inp"
            value={v.google_maps_url}
            onChange={(e) => setV({ ...v, google_maps_url: e.target.value })}
          />
        </div>
        <div className={field}>
          <span className="flbl">Image URL</span>
          <input
            className="inp"
            value={v.image_url}
            onChange={(e) => setV({ ...v, image_url: e.target.value })}
          />
        </div>
        <div className={field}>
          <span className="flbl">Latitude</span>
          <input className="inp font-mono" value={v.lat} onChange={(e) => setV({ ...v, lat: e.target.value })} />
        </div>
        <div className={field}>
          <span className="flbl">Longitude</span>
          <input className="inp font-mono" value={v.lng} onChange={(e) => setV({ ...v, lng: e.target.value })} />
        </div>
        <div className="flex items-center gap-6 md:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
            <input
              type="checkbox"
              checked={v.reservation_required}
              onChange={(e) => setV({ ...v, reservation_required: e.target.checked })}
            />
            Reservation required
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
            <input
              type="checkbox"
              checked={v.is_active}
              onChange={(e) => setV({ ...v, is_active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </div>

      {/* Menu items */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-[18px] font-bold">Menu items</h2>
        <button className="btn2 btnsm" onClick={addItem}>
          + Add item
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Price (GHS)</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.filter((i) => !i._deleted).map((item) => (
              <tr key={item._tmpId}>
                <td>
                  <input
                    className="inp h-[38px]"
                    value={item.name ?? ""}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) => (x._tmpId === item._tmpId ? { ...x, name: e.target.value } : x))
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    className="inp h-[38px] w-[110px]"
                    value={item.category ?? "other"}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) =>
                          x._tmpId === item._tmpId
                            ? { ...x, category: e.target.value as MenuCategory }
                            : x
                        )
                      )
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="pinp"
                    type="number"
                    value={item.price_ghs ?? 0}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) =>
                          x._tmpId === item._tmpId ? { ...x, price_ghs: Number(e.target.value) } : x
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className="inp h-[38px]"
                    value={item.notes ?? ""}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) => (x._tmpId === item._tmpId ? { ...x, notes: e.target.value } : x))
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    className="font-semibold text-staletext hover:underline"
                    onClick={() =>
                      setItems((cur) =>
                        cur.map((x) => (x._tmpId === item._tmpId ? { ...x, _deleted: true } : x))
                      )
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className="why mt-4 not-italic text-staletext">{error}</div>}

      <div className="mt-6 flex gap-3">
        <button className="btn btnsm px-8" onClick={save} disabled={busy || !v.name.trim()}>
          {busy ? "Saving…" : "Save venue"}
        </button>
        {venue && (
          <button className="btn2 btnsm !text-staletext" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
