"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CUISINE_KINDS, VENUE_VIBE_TAGS } from "@/lib/catalog";
import { IconChevron, IconClock, IconImage, IconPlus, IconStar, IconTrash } from "@/components/planner/icons";
import { SaveBar, Section, Stepper, SwitchRow, useToast } from "./ui";

export interface PlaceRow {
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

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Everything a venue says about itself, in four cards: photos, what you are,
 * how people reach you, and groups. Saved together from a bar that only
 * appears once something has changed.
 *
 * Only the columns migration 0038 (and 0048) lets a venue write are sent;
 * the trigger from 0047 hands back the old value for anything else, so the
 * shape of the update is part of the permission model.
 */
export function PlaceEditor({ row, hoursSummary, hoursHref }: { row: PlaceRow; hoursSummary: string | null; hoursHref: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(row);
  const [v, setV] = useState(row);
  const [busy, setBusy] = useState(false);
  const [allFood, setAllFood] = useState(false);
  const { say, toast } = useToast();
  const set = <K extends keyof PlaceRow>(k: K, val: PlaceRow[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  const photos = [v.image_url, ...(v.gallery_urls ?? [])].filter((u): u is string => Boolean(u));
  const setPhotos = (list: string[]) => setV((cur) => ({ ...cur, image_url: list[0] ?? null, gallery_urls: list.slice(1) }));

  const toggle = (list: string[] | null, x: string) => ((list ?? []).includes(x) ? (list ?? []).filter((y) => y !== x) : [...(list ?? []), x]);

  async function save() {
    setBusy(true);
    const { error } = await createClient()
      .from("venues")
      .update({
        description: v.description?.trim() || null,
        phone: v.phone?.trim() || null,
        whatsapp_phone: v.whatsapp_phone?.trim() || null,
        booking_url: v.booking_url?.trim() || null,
        instagram_handle: v.instagram_handle?.trim().replace(/^@/, "") || null,
        image_url: v.image_url || null,
        gallery_urls: v.gallery_urls ?? [],
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
    if (error) return say("That did not save. Try again.", false);
    setSaved(v);
    say("Saved. It's live.");
    router.refresh();
  }

  const food = allFood ? [...CUISINE_KINDS] : [...new Set([...(v.cuisines ?? []), ...CUISINE_KINDS.slice(0, 10)])];

  return (
    <div className="flex flex-col gap-5">
      <Section id="photos" title="Photos" sub="The first thing anybody sees. The first one leads your card." delay={40}>
        <PhotoGrid photos={photos} onChange={setPhotos} />
      </Section>

      <Section id="about" title="What you are" sub="How somebody looking for Korean food, or somewhere calm, finds you." delay={80}>
        <label className="block">
          <span className="pl-label">Describe your place in a sentence or two</span>
          <textarea
            className="pl-input"
            maxLength={280}
            value={v.description ?? ""}
            placeholder="A rooftop grill with a view of the city, live highlife on Fridays."
            onChange={(e) => set("description", e.target.value)}
          />
          <span className="pl-hint mt-1 block text-right tabular-nums">{(v.description ?? "").length}/280</span>
        </label>

        <div className="mt-4">
          <span className="pl-label">Food you serve</span>
          <div className="flex flex-wrap gap-2">
            {food.map((k) => (
              <button key={k} type="button" className="pl-chip !min-h-[40px] !text-[14px] capitalize" aria-pressed={(v.cuisines ?? []).includes(k)} onClick={() => set("cuisines", toggle(v.cuisines, k))}>
                {k}
              </button>
            ))}
            {!allFood ? (
              <button type="button" className="px-2 text-[14px] font-bold text-[var(--p-accent)]" onClick={() => setAllFood(true)}>
                More…
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <span className="pl-label">How it feels</span>
          <div className="flex flex-wrap gap-2">
            {VENUE_VIBE_TAGS.map((t) => (
              <button key={t} type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={(v.vibe_tags ?? []).includes(t)} onClick={() => set("vibe_tags", toggle(v.vibe_tags, t))}>
                {label(t)}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-5 block">
          <span className="pl-label">
            Dress code <span className="font-semibold text-[var(--p-muted)]">· if you have one</span>
          </span>
          <input className="pl-input" value={v.dress_code ?? ""} placeholder="Smart casual" onChange={(e) => set("dress_code", e.target.value)} />
        </label>
      </Section>

      <Link
        href={hoursHref}
        className="pl-card pl-up pl-lift flex items-center gap-4 p-5"
        style={{ animationDelay: "120ms" }}
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--p-accent-soft)] text-[var(--p-accent)]">
          <IconClock size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold">Opening hours</span>
          <span className="block truncate text-[14px] text-[var(--p-muted)]">{hoursSummary ?? "Not set yet. We need these to send people to you."}</span>
        </span>
        <IconChevron className="text-[var(--p-muted)]" />
      </Link>

      <Section id="contact" title="How people reach you" sub="We show people the way you actually take bookings." delay={160}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="pl-label">Phone, for calls</span>
            <input className="pl-input" inputMode="tel" value={v.phone ?? ""} placeholder="+233 …" onChange={(e) => set("phone", e.target.value)} />
            <span className="pl-hint mt-1 block">Goes live straight away.</span>
          </label>
          <label className="block">
            <span className="pl-label">WhatsApp, for bookings</span>
            <input className="pl-input" inputMode="tel" value={v.whatsapp_phone ?? ""} placeholder="+233 …" onChange={(e) => set("whatsapp_phone", e.target.value)} />
            <span className="pl-hint mt-1 block">Leave empty if you don&apos;t take bookings on WhatsApp.</span>
          </label>
          <label className="block">
            <span className="pl-label">
              Booking page <span className="font-semibold text-[var(--p-muted)]">· optional</span>
            </span>
            <input className="pl-input" inputMode="url" value={v.booking_url ?? ""} placeholder="https://…" onChange={(e) => set("booking_url", e.target.value)} />
            <span className="pl-hint mt-1 block">If you have one, we send people straight there.</span>
          </label>
          <label className="block">
            <span className="pl-label">Instagram</span>
            <input className="pl-input" autoCapitalize="none" value={v.instagram_handle ?? ""} placeholder="@yourplace" onChange={(e) => set("instagram_handle", e.target.value)} />
          </label>
        </div>
        <div className="mt-4">
          <SwitchRow
            on={v.reservation_required}
            onChange={(n) => set("reservation_required", n)}
            title="People should book ahead"
            sub="We tell people to reserve before they come."
          />
        </div>
      </Section>

      <Section title="Groups" sub="So we don't send a party of twelve to a place for two." delay={200}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="pl-label">Smallest group you take</span>
            <Stepper value={v.min_party_size ?? 1} onChange={(n) => set("min_party_size", n ?? 1)} min={1} max={50} />
          </div>
          <div>
            <span className="pl-label">Largest group</span>
            <Stepper value={v.max_party_size} onChange={(n) => set("max_party_size", n)} min={1} max={500} blankLabel="No limit" />
          </div>
        </div>
      </Section>

      <Section title="Showing in plans" delay={240}>
        <SwitchRow
          on={v.is_active}
          onChange={(n) => set("is_active", n)}
          title={v.is_active ? "You're showing in plans" : "You're hidden from plans"}
          sub="Switch off if you're closed for a while. Your menu, hours and photos are kept."
        />
      </Section>

      <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onUndo={() => setV(saved)} />
      {toast}
    </div>
  );
}

/**
 * The venue's photos, the first one leading. Upload several at once from the
 * phone; tap one to make it the lead or take it away.
 */
function PhotoGrid({ photos, onChange }: { photos: string[]; onChange: (list: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  async function upload(files: File[]) {
    setError(null);
    setBusy(files.length);
    const added: string[] = [];
    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "venues");
      try {
        const res = await fetch("/api/venue/upload", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) setError(data.error ?? "A photo did not upload.");
        else added.push(data.url as string);
      } catch {
        setError("A photo did not upload. Check your connection.");
      }
      setBusy((n) => n - 1);
    }
    if (added.length) onChange([...photos, ...added]);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url, i) => (
          <div key={url} className={`pl-pop group relative overflow-hidden rounded-2xl bg-[var(--p-sunken)] ${i === 0 ? "col-span-2 aspect-[16/10] sm:col-span-2 sm:row-span-2 sm:aspect-auto" : "aspect-square"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            {i === 0 ? (
              <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[12px] font-bold text-white backdrop-blur">
                <IconStar size={13} /> Main photo
              </span>
            ) : null}
            <button
              type="button"
              aria-label="Photo options"
              className="absolute inset-0"
              onClick={() => setPicked(picked === url ? null : url)}
            />
            {picked === url ? (
              <div className="pl-fade absolute inset-x-2 bottom-2 flex gap-2">
                {i > 0 ? (
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/95 py-2 text-[13px] font-bold text-[var(--p-ink)] shadow"
                    onClick={() => {
                      onChange([url, ...photos.filter((p) => p !== url)]);
                      setPicked(null);
                    }}
                  >
                    <IconStar size={14} /> Make main
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/95 py-2 text-[13px] font-bold text-[#b42318] shadow"
                  onClick={() => {
                    onChange(photos.filter((p) => p !== url));
                    setPicked(null);
                  }}
                >
                  <IconTrash size={14} /> Remove
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={`up${i}`} className="pl-skeleton aspect-square rounded-2xl" />
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`pl-tap flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--p-line)] bg-white text-center transition-colors hover:border-[var(--p-accent)] ${
            photos.length ? "aspect-square" : "col-span-2 aspect-[16/9] sm:col-span-3 sm:aspect-[3/1]"
          }`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--p-accent-soft)] text-[var(--p-accent)]">
            {photos.length ? <IconPlus size={24} /> : <IconImage size={26} />}
          </span>
          <span className="text-[14.5px] font-bold">{photos.length ? "Add more" : "Add photos"}</span>
          {!photos.length ? <span className="pl-hint px-4">Your room, your food, your best table. Pick several at once.</span> : null}
        </button>
      </div>
      {photos.length > 1 ? <p className="pl-hint mt-2">Tap a photo to make it the main one or remove it.</p> : null}
      {error ? <p className="mt-2 text-[13.5px] font-semibold text-[var(--p-accent-dark)]">{error}</p> : null}
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void upload(files);
        }}
      />
    </div>
  );
}
