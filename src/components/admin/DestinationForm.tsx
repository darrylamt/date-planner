"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GHANA_REGIONS } from "@/lib/stays";
import { photoCredit } from "@/lib/trips";

export interface DestinationDraft {
  existing: boolean;
  slug: string;
  name: string;
  region: string;
  town: string;
  gateway_town: string;
  last_leg: string;
  lat: string;
  lng: string;
  radius_km: string;
  road_km_from_accra: string;
  blurb: string;
  highlights: string;
  best_time: string;
  hero_image: string;
  image_credit: string;
  image_license: string;
  image_source: string;
  wiki_url: string;
  notes: string;
  is_active: boolean;
  sort: string;
}

const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const orNull = (s: string) => (s.trim() ? s.trim() : null);
const slugOf = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * A destination for Trips (0101): where it is, the town buses and flights
 * arrive at and the last leg from there, a blurb in our own words, what
 * people go for, and a photo with its credit. Saved through /api/admin/trips.
 */
export function DestinationForm({ initial }: { initial: DestinationDraft }) {
  const router = useRouter();
  const [d, setD] = useState<DestinationDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<DestinationDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const credit = photoCredit({ image_credit: orNull(d.image_credit), image_license: orNull(d.image_license), image_source: orNull(d.image_source) });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "destination",
          existing: d.existing,
          slug: d.slug,
          name: d.name.trim(),
          region: d.region,
          town: orNull(d.town),
          gateway_town: d.gateway_town.trim(),
          last_leg: orNull(d.last_leg),
          lat: num(d.lat),
          lng: num(d.lng),
          radius_km: num(d.radius_km) ?? 10,
          road_km_from_accra: num(d.road_km_from_accra),
          blurb: orNull(d.blurb),
          highlights: d.highlights.split("\n").map((h) => h.trim()).filter(Boolean),
          best_time: orNull(d.best_time),
          hero_image: orNull(d.hero_image),
          image_credit: orNull(d.image_credit),
          image_license: orNull(d.image_license),
          image_source: orNull(d.image_source),
          wiki_url: orNull(d.wiki_url),
          notes: orNull(d.notes),
          is_active: d.is_active,
          sort: num(d.sort) ?? 0,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That did not work.");
      // The button itself says "Done" (AdminActivity).
      if (!d.existing) router.replace(`/admin/trips/${json.slug}`);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, key: keyof DestinationDraft, props: { placeholder?: string; mono?: boolean; span?: string } = {}) => (
    <label className={props.span}>
      <span className="flbl">{label}</span>
      <input
        className={`inp h-[42px] ${props.mono ? "font-mono" : ""}`}
        value={d[key] as string}
        placeholder={props.placeholder}
        onChange={(e) => set({ [key]: e.target.value } as Partial<DestinationDraft>)}
      />
    </label>
  );

  return (
    <div className="grid max-w-[900px] gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1>{d.existing ? d.name || "A destination" : "Add a destination"}</h1>
        <a href="/admin/trips" className="text-[13px] font-semibold text-cocoa hover:text-ink">
          ← All destinations
        </a>
      </div>

      <div className="card grid gap-3 p-5 md:grid-cols-3">
        <h2 className="text-[16px] font-bold md:col-span-3">The place</h2>
        <label className="md:col-span-2">
          <span className="flbl">Name</span>
          <input
            className="inp h-[42px]"
            value={d.name}
            placeholder="Wli waterfalls"
            onChange={(e) => set({ name: e.target.value, ...(d.existing ? {} : { slug: slugOf(e.target.value) }) })}
          />
        </label>
        <label>
          <span className="flbl">Short name in links</span>
          <input
            className="inp h-[42px] font-mono"
            value={d.slug}
            disabled={d.existing}
            onChange={(e) => set({ slug: slugOf(e.target.value) })}
          />
        </label>
        <label>
          <span className="flbl">Region</span>
          <select className="inp h-[42px]" value={d.region} onChange={(e) => set({ region: e.target.value })}>
            <option value="">Choose…</option>
            {GHANA_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {field("Town it is in or by", "town", { placeholder: "Wli" })}
        {field("Buses and flights arrive at", "gateway_town", { placeholder: "Hohoe" })}
        {field("The last leg, from there", "last_leg", { placeholder: "By road from Hohoe to Wli village, then a forest walk", span: "md:col-span-3" })}
        {field("Latitude", "lat", { mono: true, placeholder: "7.1058" })}
        {field("Longitude", "lng", { mono: true, placeholder: "0.6085" })}
        {field("Counts places within (km)", "radius_km", { mono: true })}
        {field("Km from Accra by road", "road_km_from_accra", { mono: true })}
        {field("Order in the list", "sort", { mono: true })}
        {field("Best time to go", "best_time", { placeholder: "November to March, the dry season" })}
      </div>

      <div className="card grid gap-3 p-5">
        <h2 className="text-[16px] font-bold">What to say about it</h2>
        <label>
          <span className="flbl">Blurb, in our own words (one or two sentences)</span>
          <textarea className="inp min-h-[64px] py-2" maxLength={300} value={d.blurb} onChange={(e) => set({ blurb: e.target.value })} />
        </label>
        <label>
          <span className="flbl">What people go for, one per line</span>
          <textarea
            className="inp min-h-[110px] py-2"
            value={d.highlights}
            placeholder={"Walk to the lower falls\nHike to the upper falls"}
            onChange={(e) => set({ highlights: e.target.value })}
          />
        </label>
        {field("Wikipedia page", "wiki_url", { placeholder: "https://en.wikipedia.org/wiki/…" })}
      </div>

      <div className="card grid gap-3 p-5 md:grid-cols-[200px_1fr]">
        <h2 className="text-[16px] font-bold md:col-span-2">Photo</h2>
        <div>
          {d.hero_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.hero_image} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-cream text-[13px] text-mutedbrown">No photo</div>
          )}
          {credit ? <div className="mt-1 text-[11.5px] text-mutedbrown">{credit}</div> : null}
        </div>
        <div className="grid gap-3">
          {field("Photo address (1280 px wide is plenty)", "hero_image")}
          <div className="grid gap-3 md:grid-cols-2">
            {field("Taken by", "image_credit", { placeholder: "Stig Nygaard" })}
            {field("Licence", "image_license", { placeholder: "CC BY 2.0" })}
          </div>
          {field("Where it is from (the file's page)", "image_source", { placeholder: "https://commons.wikimedia.org/wiki/File:…" })}
          <p className="text-[12.5px] text-mutedbrown">
            A Commons photo under CC BY or CC BY-SA may be used if the author and licence are shown with it, which the app does. Our
            own photos need no credit.
          </p>
        </div>
      </div>

      <div className="card grid gap-3 p-5">
        <label>
          <span className="flbl">Notes for the team</span>
          <textarea className="inp min-h-[60px] py-2" value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={d.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
          Offer it in Trips (untick to hide it)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy || !d.name.trim() || !d.region || !d.slug || d.gateway_town.trim().length < 2} onClick={() => void save()}>
          {busy ? "Saving…" : d.existing ? "Save changes" : "Add this destination"}
        </button>
        {error ? <span className="text-[13px] text-staletext">{error}</span> : null}
      </div>
    </div>
  );
}
