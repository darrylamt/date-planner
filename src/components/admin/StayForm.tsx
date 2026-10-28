"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlaceDetails } from "@/lib/places";
import { GHANA_REGIONS, ROOM_TYPES, STAY_AMENITIES, STAY_KINDS, regionFromAddress } from "@/lib/stays";
import { PlacesLookup } from "./PlacesLookup";
import { ImageField } from "./ImageField";

export interface StayRoomDraft {
  id?: string;
  name: string;
  room_type: string;
  sleeps: number;
  price_per_night_ghs: number | null;
  weekend_price_ghs: number | null;
  breakfast_included: boolean;
  units: number | null;
  notes: string | null;
  is_active: boolean;
}

export interface StayDraft {
  id: string | null;
  name: string;
  kind: string;
  region: string;
  town: string;
  address: string;
  area_id: string;
  lat: string;
  lng: string;
  google_maps_url: string;
  google_place_id: string;
  phone: string;
  whatsapp_phone: string;
  booking_url: string;
  email: string;
  description: string;
  image_url: string;
  check_in: string;
  check_out: string;
  min_nights: string;
  amenities: string[];
  activities: string;
  notes: string;
  rates_checked_on: string;
  is_active: boolean;
  rooms: StayRoomDraft[];
}

const blankRoom = (): StayRoomDraft => ({
  name: "",
  room_type: "double",
  sleeps: 2,
  price_per_night_ghs: null,
  weekend_price_ghs: null,
  breakfast_included: false,
  units: null,
  notes: null,
  is_active: true,
});

const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const orNull = (s: string) => (s.trim() ? s.trim() : null);

/**
 * A place to stay, as the stays team enters it (0099): where it is (Google,
 * a Maps link or the coordinates), what kind of place, how to reach them, the
 * rooms with their nightly rates, what it has and what there is to do there.
 * Saved through /api/admin/stays, which works out the area and logs a staff
 * login's changes.
 */
export function StayForm({ initial, areas }: { initial: StayDraft; areas: { id: string; name: string }[] }) {
  const router = useRouter();
  const [s, setS] = useState<StayDraft>(initial);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<StayDraft>) => setS((cur) => ({ ...cur, ...patch }));

  async function post(body: unknown) {
    const res = await fetch("/api/admin/stays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "That did not work.");
    return json;
  }

  type Located = { placeId?: string; name?: string; address?: string; lat: number | null; lng: number | null; googleMapsUri?: string | null; phone?: string | null; website?: string | null; region?: string | null; town?: string | null };
  function fill(p: Located, from: string) {
    setS((cur) => ({
      ...cur,
      name: cur.name || p.name || "",
      address: p.address ?? cur.address,
      lat: p.lat != null ? String(p.lat) : cur.lat,
      lng: p.lng != null ? String(p.lng) : cur.lng,
      google_maps_url: p.googleMapsUri ?? cur.google_maps_url,
      google_place_id: p.placeId ?? cur.google_place_id,
      phone: cur.phone || p.phone || "",
      booking_url: cur.booking_url || p.website || "",
      region: p.region ?? cur.region,
      town: p.town ?? cur.town,
    }));
    setNote(`Location filled from ${from}.${p.region ? "" : " Pick the region yourself: it could not be read."}`);
  }

  async function locate(body: Record<string, unknown>, from: string) {
    setBusy(true);
    setError(null);
    try {
      const json = await post({ action: "locate", ...body });
      fill(json.place as Located, from);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function fromGoogle(d: PlaceDetails) {
    fill(
      {
        placeId: d.id,
        name: d.name,
        address: d.address,
        lat: d.lat,
        lng: d.lng,
        googleMapsUri: d.googleMapsUri,
        phone: d.phone,
        website: d.website,
        region: regionFromAddress(d.addressParts),
        town: d.localities?.[0] ?? null,
      },
      "Google"
    );
  }

  const room = (i: number, patch: Partial<StayRoomDraft>) =>
    setS((cur) => ({ ...cur, rooms: cur.rooms.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const json = await post({
        action: "save",
        id: s.id,
        name: s.name.trim(),
        kind: s.kind,
        region: s.region,
        town: orNull(s.town),
        address: orNull(s.address),
        area_id: s.area_id || null,
        lat: num(s.lat),
        lng: num(s.lng),
        google_maps_url: orNull(s.google_maps_url),
        google_place_id: orNull(s.google_place_id),
        phone: orNull(s.phone),
        whatsapp_phone: orNull(s.whatsapp_phone),
        booking_url: orNull(s.booking_url),
        email: orNull(s.email),
        description: s.description.trim(),
        image_url: orNull(s.image_url),
        check_in: orNull(s.check_in),
        check_out: orNull(s.check_out),
        min_nights: num(s.min_nights),
        amenities: s.amenities,
        activities: s.activities.split(",").map((a) => a.trim()).filter(Boolean),
        notes: orNull(s.notes),
        rates_checked_on: orNull(s.rates_checked_on),
        is_active: s.is_active,
        rooms: s.rooms.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim(), notes: r.notes?.trim() || null })),
      });
      // The button itself says "Done" (AdminActivity).
      setNote(null);
      if (!s.id) router.replace(`/admin/stays/${json.id}`);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-[900px] gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1>{s.id ? s.name || "A stay" : "Add a stay"}</h1>
        <a href="/admin/stays" className="text-[13px] font-semibold text-cocoa hover:text-ink">
          All stays
        </a>
      </div>

      {/* Where: Google first, then a Maps link, then the pin by hand. */}
      <div className="card grid gap-3 p-5">
        <h2 className="text-[16px] font-bold">Where it is</h2>
        <PlacesLookup initialName={s.name} linkedPlaceId={s.google_place_id || null} onApply={fromGoogle} />
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input className="inp h-[42px]" placeholder="Or paste a Google Maps link" value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="button" className="btn2" disabled={busy || !link.trim()} onClick={() => void locate({ link: link.trim() }, "the Maps link")}>
            Read link
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label>
            <span className="flbl">Latitude</span>
            <input className="inp h-[42px] font-mono" value={s.lat} placeholder="5.6037" onChange={(e) => set({ lat: e.target.value })} />
          </label>
          <label>
            <span className="flbl">Longitude</span>
            <input className="inp h-[42px] font-mono" value={s.lng} placeholder="-0.1870" onChange={(e) => set({ lng: e.target.value })} />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="btn2 w-full"
              disabled={busy || num(s.lat) == null || num(s.lng) == null}
              onClick={() => void locate({ lat: num(s.lat), lng: num(s.lng) }, "the coordinates")}
            >
              Use these coordinates
            </button>
          </div>
          <label>
            <span className="flbl">Region</span>
            <select className="inp h-[42px]" value={s.region} onChange={(e) => set({ region: e.target.value })}>
              <option value="">Pick a region</option>
              {GHANA_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="flbl">Town or location</span>
            <input className="inp h-[42px]" value={s.town} placeholder="Wli, Busua, Akosombo" onChange={(e) => set({ town: e.target.value })} />
          </label>
          <label>
            <span className="flbl">Area (optional)</span>
            <select className="inp h-[42px]" value={s.area_id} onChange={(e) => set({ area_id: e.target.value })}>
              <option value="">Work it out from the location</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-3">
            <span className="flbl">Address</span>
            <input className="inp h-[42px]" value={s.address} onChange={(e) => set({ address: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="card grid gap-3 p-5 md:grid-cols-3">
        <h2 className="text-[16px] font-bold md:col-span-3">The place</h2>
        <label className="md:col-span-2">
          <span className="flbl">Name</span>
          <input className="inp h-[42px]" value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          <span className="flbl">Kind of place</span>
          <select className="inp h-[42px]" value={s.kind} onChange={(e) => set({ kind: e.target.value })}>
            {STAY_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-3">
          <span className="flbl">Description</span>
          <textarea
            className="inp min-h-[80px] py-2"
            maxLength={2000}
            placeholder="What it is like, who it suits, what makes it worth the trip"
            value={s.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <label>
          <span className="flbl">Phone</span>
          <input className="inp h-[42px]" value={s.phone} placeholder="+233 …" onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label>
          <span className="flbl">WhatsApp</span>
          <input className="inp h-[42px]" value={s.whatsapp_phone} placeholder="+233 …" onChange={(e) => set({ whatsapp_phone: e.target.value })} />
        </label>
        <label>
          <span className="flbl">Email</span>
          <input className="inp h-[42px]" value={s.email} onChange={(e) => set({ email: e.target.value })} />
        </label>
        <label className="md:col-span-3">
          <span className="flbl">Website or booking link</span>
          <input className="inp h-[42px]" value={s.booking_url} onChange={(e) => set({ booking_url: e.target.value })} />
        </label>
        <label>
          <span className="flbl">Check-in from</span>
          <input type="time" className="inp h-[42px]" value={s.check_in} onChange={(e) => set({ check_in: e.target.value })} />
        </label>
        <label>
          <span className="flbl">Check-out by</span>
          <input type="time" className="inp h-[42px]" value={s.check_out} onChange={(e) => set({ check_out: e.target.value })} />
        </label>
        <label>
          <span className="flbl">Minimum nights</span>
          <input className="inp h-[42px]" inputMode="numeric" value={s.min_nights} onChange={(e) => set({ min_nights: e.target.value })} />
        </label>
        <div className="md:col-span-3">
          <ImageField label="Cover photo" folder="stays" value={s.image_url} onChange={(url) => set({ image_url: url })} />
        </div>
      </div>

      {/* Rooms and rates: what a night costs, for how many. */}
      <div className="card grid gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-bold">Rooms and nightly rates</h2>
          <label className="flex items-center gap-2 text-[13px] text-mutedbrown">
            Rates checked on
            <input type="date" className="inp h-[36px]" value={s.rates_checked_on} onChange={(e) => set({ rates_checked_on: e.target.value })} />
          </label>
        </div>
        {s.rooms.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="grid gap-2 rounded-bar border border-line p-3 md:grid-cols-6">
            <label className="md:col-span-2">
              <span className="flbl">Room</span>
              <input className="inp h-[38px]" value={r.name} placeholder="Deluxe double" onChange={(e) => room(i, { name: e.target.value })} />
            </label>
            <label>
              <span className="flbl">Type</span>
              <select className="inp h-[38px]" value={r.room_type} onChange={(e) => room(i, { room_type: e.target.value })}>
                {ROOM_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="flbl">Sleeps</span>
              <input className="inp h-[38px]" inputMode="numeric" value={String(r.sleeps)} onChange={(e) => room(i, { sleeps: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label>
              <span className="flbl">GHS a night</span>
              <input className="inp h-[38px]" inputMode="decimal" value={r.price_per_night_ghs ?? ""} onChange={(e) => room(i, { price_per_night_ghs: num(e.target.value) })} />
            </label>
            <label>
              <span className="flbl">Weekend</span>
              <input className="inp h-[38px]" inputMode="decimal" placeholder="same" value={r.weekend_price_ghs ?? ""} onChange={(e) => room(i, { weekend_price_ghs: num(e.target.value) })} />
            </label>
            <label>
              <span className="flbl">How many</span>
              <input className="inp h-[38px]" inputMode="numeric" value={r.units ?? ""} onChange={(e) => room(i, { units: num(e.target.value) })} />
            </label>
            <label className="md:col-span-3">
              <span className="flbl">Notes</span>
              <input className="inp h-[38px]" value={r.notes ?? ""} placeholder="Sea view, shared bathroom…" onChange={(e) => room(i, { notes: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={r.breakfast_included} onChange={(e) => room(i, { breakfast_included: e.target.checked })} />
              Breakfast included
            </label>
            <div className="flex items-center justify-end">
              <button type="button" className="text-[13px] font-semibold text-staletext" onClick={() => set({ rooms: s.rooms.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn2 btnsm justify-self-start" onClick={() => set({ rooms: [...s.rooms, blankRoom()] })}>
          Add a room type
        </button>
      </div>

      <div className="card grid gap-3 p-5">
        <h2 className="text-[16px] font-bold">What it has</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {STAY_AMENITIES.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={s.amenities.includes(a.id)}
                onChange={(e) => set({ amenities: e.target.checked ? [...s.amenities, a.id] : s.amenities.filter((x) => x !== a.id) })}
              />
              {a.label}
            </label>
          ))}
        </div>
        <label>
          <span className="flbl">Things to do there, separated by commas</span>
          <input className="inp h-[42px]" value={s.activities} placeholder="Canopy walk, kayaking, bonfire nights, guided hike" onChange={(e) => set({ activities: e.target.value })} />
        </label>
        <label>
          <span className="flbl">Notes for the team</span>
          <textarea className="inp min-h-[60px] py-2" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={s.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
          Open for guests (untick only if it has closed)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy || !s.name.trim() || !s.region} onClick={() => void save()}>
          {busy ? "Saving…" : s.id ? "Save changes" : "Add this stay"}
        </button>
        {note ? <span className="text-[13px] text-mutedbrown">{note}</span> : null}
        {error ? <span className="text-[13px] text-staletext">{error}</span> : null}
      </div>
    </div>
  );
}
