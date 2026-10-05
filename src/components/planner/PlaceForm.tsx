"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PosterUpload } from "./PosterUpload";
import type { Place } from "./nights";

const TYPES: { value: string; label: string; hint: string; emoji: string }[] = [
  { value: "lounge", label: "Bar or club", hint: "Taking you for the night", emoji: "🍸" },
  { value: "outdoor", label: "Outdoors", hint: "A lawn, beach, rooftop, car park", emoji: "🌴" },
  { value: "activity", label: "Studio or hall", hint: "A studio, court or hall", emoji: "🏛️" },
  { value: "restaurant", label: "Restaurant", hint: "A kitchen serving your guests", emoji: "🍽️" },
  { value: "cafe", label: "Cafe", hint: "Coffee and somewhere to sit", emoji: "☕" },
];

/**
 * Adding a place that is not on Duro yet.
 *
 * It is an ordinary venue row, so the map link, the fare to the next stop and
 * the share page all work without knowing a planner made it, and it goes live
 * at once: the checking happened before the account was issued. A trigger
 * (0046) makes it theirs on insert. There is no read-back on the insert,
 * because a planner may write venues but not read most of their columns, so
 * the new place is found through their own grants instead.
 */
export function PlaceForm({
  areas,
  known,
  onCreated,
  onCancel,
}: {
  areas: { id: string; name: string }[];
  /** Ids of places already listed, so the new one can be told apart. */
  known: string[];
  onCreated: (place: Place) => void;
  onCancel?: () => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("lounge");
  const [areaId, setAreaId] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return setError("Give the place a name.");
    if (!areaId) return setError("Choose the part of town it is in.");
    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from("venues").insert({
      name: name.trim(),
      type,
      area_id: areaId,
      description: description.trim(),
      google_maps_url: mapsUrl.trim() || null,
      image_url: image.trim() || null,
    });
    if (insertError) {
      setBusy(false);
      return setError("We could not add that place. Try again, or tell us under Help.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("venue_users")
      .select("venues(id, name, area_id, areas(name))")
      .eq("user_id", user?.id ?? "");
    setBusy(false);

    const mine = (data ?? [])
      .map((r: { venues: unknown }) => r.venues as { id: string; name: string; area_id: string; areas: { name: string } | null } | null)
      .filter((v): v is { id: string; name: string; area_id: string; areas: { name: string } | null } => Boolean(v));
    const fresh = mine.find((v) => !known.includes(v.id)) ?? mine.find((v) => v.name === name.trim());
    if (!fresh) return setError("Added, but we could not find it again. Refresh the page.");
    onCreated({ id: fresh.id, name: fresh.name, area_id: fresh.area_id, area: fresh.areas?.name ?? "", mine: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="block">
        <span className="pl-label">What is the place called?</span>
        <input
          className="pl-input"
          value={name}
          placeholder="The Lawn at Alliance Française"
          onChange={(e) => setName(e.target.value)}
        />
        <span className="pl-hint mt-1.5 block">The place, not the night. Your night gets its own name.</span>
      </label>

      <div>
        <span className="pl-label">What kind of place?</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => setType(t.value)}
              className={`pl-tap flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors ${
                type === t.value
                  ? "border-[var(--p-accent)] bg-[var(--p-accent-soft)]"
                  : "border-[var(--p-line)] bg-white hover:border-[var(--p-accent)]"
              }`}
            >
              <span className="text-[24px]">{t.emoji}</span>
              <span>
                <span className="block text-[15px] font-bold">{t.label}</span>
                <span className="block text-[13px] text-[var(--p-muted)]">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="pl-label">Part of town</span>
        <select className="pl-input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          <option value="">Choose one</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="pl-hint mt-1.5 block">This decides which plans it can be in, and only we can change it later.</span>
      </label>

      <label className="block">
        <span className="pl-label">Google Maps link</span>
        <input
          className="pl-input"
          value={mapsUrl}
          inputMode="url"
          placeholder="https://maps.app.goo.gl/…"
          onChange={(e) => setMapsUrl(e.target.value)}
        />
        <span className="pl-hint mt-1.5 block">
          Worth finding: without it we cannot work out the ride there, and the place is left out of evenings that start elsewhere.
        </span>
      </label>

      <label className="block">
        <span className="pl-label">In a sentence</span>
        <textarea
          className="pl-input"
          value={description}
          maxLength={300}
          placeholder="An open lawn behind the main building, tables under the trees."
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div>
        <span className="pl-label">A picture of the place</span>
        <PosterUpload
          value={image}
          onChange={setImage}
          folder="locations"
          label="Add a photo"
          hint="The place itself. Your poster goes on the night."
          aspect="aspect-[16/9]"
        />
      </div>

      {error ? <p className="text-[14px] font-semibold text-[var(--p-accent-dark)]">{error}</p> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button type="button" className="pl-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="pl-btn" onClick={() => void create()} disabled={busy}>
          {busy ? "Adding…" : "Add this place"}
        </button>
      </div>
    </div>
  );
}
