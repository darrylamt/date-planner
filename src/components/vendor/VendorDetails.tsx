"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PosterUpload } from "@/components/planner/PosterUpload";
import type { VendorRow } from "@/lib/vendorAuth";

const NOTICE = [
  { hours: 0, label: "Same day" },
  { hours: 24, label: "A day ahead" },
  { hours: 48, label: "Two days" },
  { hours: 72, label: "Three days" },
];

/**
 * How people reach and find the vendor, and how much notice they need. The
 * notice matters most: nothing is offered for a plan sooner than it.
 */
export function VendorDetails({ vendor, areas, username }: { vendor: VendorRow; areas: { id: string; name: string }[]; username: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [v, setV] = useState({
    phone: vendor.phone ?? "",
    whatsapp_phone: vendor.whatsapp_phone ?? "",
    instagram_handle: vendor.instagram_handle ?? "",
    address: vendor.address ?? "",
    google_maps_url: vendor.google_maps_url ?? "",
    area_id: vendor.area_id ?? "",
    image_url: vendor.image_url ?? "",
    lead_time_hours: vendor.lead_time_hours,
    is_active: vendor.is_active,
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((cur) => ({ ...cur, [k]: val }));

  async function save() {
    if (!v.phone.trim() && !v.whatsapp_phone.trim()) return setNote("Add a phone or WhatsApp number, so people can order.");
    setBusy(true);
    setNote(null);
    const { error } = await supabase
      .from("gift_vendors")
      .update({
        phone: v.phone.trim() || null,
        whatsapp_phone: v.whatsapp_phone.trim() || null,
        instagram_handle: v.instagram_handle.trim() || null,
        address: v.address.trim() || null,
        google_maps_url: v.google_maps_url.trim() || null,
        area_id: v.area_id || null,
        image_url: v.image_url.trim() || null,
        lead_time_hours: v.lead_time_hours,
        is_active: v.is_active,
      })
      .eq("id", vendor.id);
    setBusy(false);
    if (error) return setNote("That did not save. Try again.");
    setNote("Saved. It is live.");
    router.refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/vendor/login");
    router.refresh();
  }

  const field = (label: string, key: "phone" | "whatsapp_phone" | "instagram_handle" | "address" | "google_maps_url", placeholder: string, hint?: string) => (
    <label className="block">
      <span className="pl-label">{label}</span>
      <input className="pl-input" value={v[key]} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} />
      {hint ? <span className="pl-hint mt-1.5 block">{hint}</span> : null}
    </label>
  );

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <section className="pl-card flex flex-col gap-5 p-5">
        <div>
          <div className="text-[20px] font-bold">{vendor.name}</div>
          <div className="text-[14px] text-[var(--p-muted)]">
            {vendor.kind === "cake" ? "Cakes" : "Flowers"} · signs in as {username}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--p-sunken)] px-4 py-3">
          <span>
            <span className="block text-[15px] font-bold">Show me in plans</span>
            <span className="block text-[13px] text-[var(--p-muted)]">Switch off when you are closed or fully booked.</span>
          </span>
          <input type="checkbox" className="h-6 w-6 accent-[var(--p-accent)]" checked={v.is_active} onChange={(e) => set("is_active", e.target.checked)} />
        </label>

        <div>
          <span className="pl-label">How much notice do you need?</span>
          <div className="flex flex-wrap gap-2">
            {NOTICE.map((n) => (
              <button key={n.hours} type="button" className="pl-chip" aria-pressed={v.lead_time_hours === n.hours} onClick={() => set("lead_time_hours", n.hours)}>
                {n.label}
              </button>
            ))}
          </div>
          <p className="pl-hint mt-2">You are only offered for plans at least this far ahead.</p>
        </div>

        {field("Phone", "phone", "+233 …", "For people who ring to order.")}
        {field("WhatsApp", "whatsapp_phone", "+233 …", "Only if you take orders on WhatsApp. People will message this number.")}
        {field("Instagram", "instagram_handle", "@yourshop")}

        <label className="block">
          <span className="pl-label">Part of town</span>
          <select className="pl-input" value={v.area_id} onChange={(e) => set("area_id", e.target.value)}>
            <option value="">Choose one</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {field("Address or landmark", "address", "Opposite the Shell at Spintex")}
        {field("Google Maps link", "google_maps_url", "https://maps.app.goo.gl/…", "So people can find you for the pickup.")}

        <div>
          <span className="pl-label">Your logo or shop photo</span>
          <PosterUpload value={v.image_url} onChange={(u) => set("image_url", u)} folder="gifts" label="Add a photo" hint="Square works best." aspect="aspect-[16/9]" />
        </div>

        {note ? <p className="text-[14px] font-semibold">{note}</p> : null}
        <button type="button" className="pl-btn" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </section>

      <p className="text-center text-[13.5px] text-[var(--p-muted)]">
        To change your shop&apos;s name, email planbyaduro@gmail.com.
      </p>
      <button type="button" className="pl-btn-ghost w-full !text-[#b42318]" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}
