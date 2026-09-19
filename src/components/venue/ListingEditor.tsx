"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { ImageField, ImageListField } from "@/components/admin/ImageField";
import { CUISINE_KINDS, VENUE_VIBE_TAGS } from "@/lib/catalog";

export interface ListingRow {
  id: string;
  name: string;
  description: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  booking_url: string | null;
  instagram_handle: string | null;
  image_url: string | null;
  gallery_urls: string[] | null;
  cuisines: string[] | null;
  dress_code: string | null;
  reservation_required: boolean;
  is_active: boolean;
  vibe_tags: string[] | null;
  min_party_size: number | null;
  max_party_size: number | null;
}

/**
 * Everything a venue may say about itself.
 *
 * Saved in one go rather than field by field, unlike the admin's kitchen
 * screen: that one is a person working through a hundred and forty rows, where
 * a Save All is a screen you lose work on. This is one venue describing itself
 * in a sitting, where a save button is the thing that says you are finished.
 */
export function ListingEditor({ row }: { row: ListingRow }) {
  const supabase = createClient();
  const [v, setV] = useState(row);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const set = <K extends keyof ListingRow>(key: K, value: ListingRow[K]) =>
    setV((cur) => ({ ...cur, [key]: value }));

  async function save() {
    setBusy(true);
    /*
     * Named columns, and only the ones migration 0038 granted. Sending a
     * column the venue may not write fails the whole update, so the shape of
     * this object is part of the permission model rather than incidental.
     */
    const { error } = await supabase
      .from("venues")
      .update({
        description: v.description?.trim() || null,
        phone: v.phone?.trim() || null,
        whatsapp_phone: v.whatsapp_phone?.trim() || null,
        booking_url: v.booking_url?.trim() || null,
        instagram_handle: v.instagram_handle?.trim() || null,
        image_url: v.image_url || null,
        gallery_urls: (v.gallery_urls ?? []).map((u) => u.trim()).filter(Boolean),
        cuisines: v.cuisines ?? [],
        dress_code: v.dress_code?.trim() || null,
        reservation_required: v.reservation_required,
        is_active: v.is_active,
        vibe_tags: v.vibe_tags ?? [],
        min_party_size: Number(v.min_party_size) || 1,
        max_party_size: v.max_party_size == null ? null : Number(v.max_party_size),
      })
      .eq("id", v.id);
    setBusy(false);

    setToast(error ? `Could not save: ${error.message}` : "Saved");
    setTimeout(() => setToast(null), 3000);
  }

  const toggle = (list: string[] | null, value: string) =>
    (list ?? []).includes(value)
      ? (list ?? []).filter((x) => x !== value)
      : [...(list ?? []), value];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Pictures, first, because it is the gap that matters most ── */}
      <section className="card p-5">
        <h2 className="font-display text-[18px] font-bold">Pictures</h2>
        <p className="mb-4 mt-1 text-[14px] text-mutedbrown">
          The first thing anybody sees. A plan with no photograph of your place is a plan people
          scroll past.
        </p>
        <div className="flex flex-col gap-4">
          <ImageField
            label="Main picture"
            value={v.image_url ?? ""}
            onChange={(url) => set("image_url", url)}
            folder="venues"
            hint="The one that leads your card"
          />
          <ImageListField
            label="More pictures"
            values={v.gallery_urls ?? []}
            onChange={(urls) => set("gallery_urls", urls)}
            folder="venues"
            hint="People swipe through these, in this order"
          />
        </div>
      </section>

      {/* ── How people reach you ── */}
      <section className="card p-5">
        <h2 className="font-display text-[18px] font-bold">How people reach you</h2>
        <p className="mb-4 mt-1 text-[14px] text-mutedbrown">
          Two different numbers, on purpose. Most places take bookings by phone; some take them on
          WhatsApp. Tell us which you do and we will send people the right way.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col">
            <span className="flbl">Phone, for calls</span>
            <input
              className="inp"
              value={v.phone ?? ""}
              placeholder="+233 …"
              onChange={(e) => set("phone", e.target.value)}
            />
            {/*
              The number a venue puts here goes live immediately, unlike one
              typed by anybody else. They are the authoritative source about
              their own line, and queueing it behind us would mean a restaurant
              that changed its number last week still cannot be rung this week.
            */}
            <span className="mt-1 text-[12.5px] text-mutedbrown">
              Goes live straight away. This is the number we show people.
            </span>
          </label>

          <label className="flex flex-col">
            <span className="flbl">WhatsApp, for bookings</span>
            <input
              className="inp"
              value={v.whatsapp_phone ?? ""}
              placeholder="Leave empty if you do not take WhatsApp bookings"
              onChange={(e) => set("whatsapp_phone", e.target.value)}
            />
            <span className="mt-1 text-[12.5px] text-mutedbrown">
              Empty means we ask people to ring you instead of messaging.
            </span>
          </label>

          <label className="flex flex-col">
            <span className="flbl">Booking page</span>
            <input
              className="inp"
              value={v.booking_url ?? ""}
              placeholder="https://..."
              onChange={(e) => set("booking_url", e.target.value)}
            />
            {/*
              Said plainly because it changes what the Reserve button does,
              and a venue running a booking system needs the booking to land
              in that system rather than in somebody's WhatsApp.
            */}
            <span className="mt-1 text-[12.5px] text-mutedbrown">
              If you have one, we send people straight here instead of messaging or ringing you.
            </span>
          </label>

          <label className="flex flex-col">
            <span className="flbl">Instagram</span>
            <input
              className="inp"
              value={v.instagram_handle ?? ""}
              placeholder="@yourvenue"
              onChange={(e) => set("instagram_handle", e.target.value)}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              checked={v.reservation_required}
              onChange={(e) => set("reservation_required", e.target.checked)}
            />
            People should book ahead
          </label>
        </div>
      </section>

      {/* ── What you are ── */}
      <section className="card p-5">
        <h2 className="font-display text-[18px] font-bold">What you are</h2>
        <p className="mb-4 mt-1 text-[14px] text-mutedbrown">
          This is how somebody searching for Korean food, or somewhere quiet, finds you.
        </p>

        <label className="flex flex-col">
          <span className="flbl">Describe your place in a sentence</span>
          <textarea
            className="inp min-h-[76px] py-2"
            maxLength={280}
            value={v.description ?? ""}
            placeholder="What it actually is. No marketing words, they read as noise."
            onChange={(e) => set("description", e.target.value)}
          />
          <span className="mt-1 text-[12.5px] text-mutedbrown">
            {(v.description ?? "").length}/280
          </span>
        </label>

        <div className="mt-4">
          <span className="flbl">Kind of food</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUISINE_KINDS.map((k) => {
              const on = (v.cuisines ?? []).includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("cuisines", toggle(v.cuisines, k))}
                  className={`rounded-full border px-2.5 py-1 text-[12.5px] font-semibold capitalize transition-colors ${
                    on
                      ? "border-flame bg-flame text-blush"
                      : "border-line text-cocoa hover:border-flame hover:text-flame"
                  }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <span className="flbl">How it feels</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {VENUE_VIBE_TAGS.map((t) => {
              const on = (v.vibe_tags ?? []).includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("vibe_tags", toggle(v.vibe_tags, t))}
                  className={`rounded-full border px-2.5 py-1 text-[12.5px] font-semibold capitalize transition-colors ${
                    on
                      ? "border-flame bg-flame text-blush"
                      : "border-line text-cocoa hover:border-flame hover:text-flame"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="flex flex-col">
            <span className="flbl">Dress code, if you have one</span>
            <input
              className="inp"
              value={v.dress_code ?? ""}
              placeholder="e.g. smart casual"
              onChange={(e) => set("dress_code", e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Smallest group you take</span>
            <input
              type="number"
              min={1}
              className="inp font-mono"
              value={v.min_party_size ?? 1}
              onChange={(e) => set("min_party_size", Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Largest, blank for no limit</span>
            <input
              type="number"
              min={1}
              className="inp font-mono"
              value={v.max_party_size ?? ""}
              onChange={(e) =>
                set("max_party_size", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </label>
        </div>
      </section>

      {/* ── Open or not ── */}
      <section className="card p-5">
        <h2 className="font-display text-[18px] font-bold">Are you open?</h2>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[14px]">
          <input
            type="checkbox"
            className="mt-1"
            checked={!v.is_active}
            onChange={(e) => set("is_active", !e.target.checked)}
          />
          <span>
            <b>Temporarily hide me from plans.</b>
            <span className="block text-mutedbrown">
              Use this if you are closed for renovation or between seasons. Nobody will be sent to
              you until you untick it. Your menu, hours and pictures are all kept.
            </span>
          </span>
        </label>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button className="btn px-8 shadow-lg" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
