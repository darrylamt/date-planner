"use client";

import { useState } from "react";
import { PosterUpload } from "./PosterUpload";
import { IconCheck, IconPin, IconSearch, IconWarn } from "./icons";
import type { Place } from "./nights";

const TYPES: { value: string; label: string; hint: string; emoji: string }[] = [
  { value: "lounge", label: "Bar or club", hint: "Taking you for the night", emoji: "🍸" },
  { value: "outdoor", label: "Outdoors", hint: "A lawn, beach, rooftop, car park", emoji: "🌴" },
  { value: "activity", label: "Studio or hall", hint: "A studio, court or hall", emoji: "🏛️" },
  { value: "restaurant", label: "Restaurant", hint: "A kitchen serving your guests", emoji: "🍽️" },
  { value: "cafe", label: "Cafe", hint: "Coffee and somewhere to sit", emoji: "☕" },
];

interface Found {
  placeId: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  mapsUrl: string | null;
  type: string;
  city: string | null;
  area: { id: string; name: string } | null;
  areaProposal: string | null;
  existing: { id: string; name: string; area: string } | null;
}

type AreaChoice = { id: string | null; name: string; how: "google" | "list" | "new" };

async function ask<T>(payload: Record<string, unknown>): Promise<T & { error?: string }> {
  const res = await fetch("/api/planner/place", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !json.error) json.error = "That did not work. Try again.";
  return json;
}

/**
 * Adding a place that is not on Duro yet, found on Google first.
 *
 * The Google Maps link is the important part: it is how we know where the
 * place is, so the ride there can be worked out and the place can be in an
 * evening at all. So it comes first, as a link pasted from Maps' Share
 * button or a name searched on Google, and everything else is filled in
 * from what Google knows, for the planner to check rather than type.
 *
 * The part of town is suggested from the address. They can change it to one
 * on the list, or type one that is not, which Google must recognise near the
 * place before it is added for everybody.
 */
export function PlaceForm({
  areas,
  onCreated,
  onCancel,
  onUseExisting,
}: {
  areas: { id: string; name: string }[];
  /** Kept for callers; the new place is identified by the server now. */
  known?: string[];
  onCreated: (place: Place) => void;
  onCancel?: () => void;
  /** When the place is already on Duro, pick it instead of adding it again. */
  onUseExisting?: (id: string) => void;
}) {
  const [input, setInput] = useState("");
  const [finding, setFinding] = useState(false);
  const [results, setResults] = useState<{ id: string; name: string; address: string }[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("lounge");
  const [area, setArea] = useState<AreaChoice | null>(null);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function take(place: Found, fromLink: string | null) {
    setFound(place);
    setLink(fromLink);
    setResults(null);
    setNotice(null);
    setName(place.name);
    setType(TYPES.some((t) => t.value === place.type) ? place.type : "lounge");
    setArea(place.area ? { ...place.area, how: "google" } : null);
  }

  async function find() {
    const text = input.trim();
    if (text.length < 2) return setNotice("Paste the Google Maps link, or type the place's name.");
    setFinding(true);
    setNotice(null);
    setResults(null);
    const r = await ask<{ kind?: string; place?: Found; results?: { id: string; name: string; address: string }[]; message?: string }>({
      action: "find",
      input: text,
    });
    setFinding(false);
    if (r.error) return setNotice(r.error);
    if (r.kind === "place" || r.kind === "pin") return take(r.place!, text.startsWith("http") ? text : null);
    if (r.kind === "results") {
      if (!r.results?.length) return setNotice("Nothing on Google in Ghana by that name. Try the Maps link instead.");
      return setResults(r.results);
    }
    setNotice(r.message ?? "We could not find that. Try typing the place's name.");
  }

  async function pick(placeId: string) {
    setFinding(true);
    const r = await ask<{ place?: Found }>({ action: "pick", placeId });
    setFinding(false);
    if (r.error || !r.place) return setNotice(r.error ?? "That did not work. Try another.");
    take(r.place, null);
  }

  async function create() {
    if (!found) return;
    if (!name.trim()) return setError("Give the place a name.");
    if (!area) return setError("Choose the part of town it is in.");
    setBusy(true);
    setError(null);
    const r = await ask<{ place?: Place }>({
      action: "create",
      placeId: found.placeId,
      link: found.placeId ? null : link ?? found.mapsUrl,
      name: name.trim(),
      type,
      description: description.trim(),
      image: image.trim(),
      areaId: area.id,
      newArea: area.id ? null : area.name,
    });
    setBusy(false);
    if (r.error || !r.place) return setError(r.error ?? "We could not add that place. Try again.");
    onCreated(r.place);
  }

  /* ── 1. Find it on Google ─────────────────────────────────────────── */
  if (!found) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-[var(--p-sunken)] p-4 text-[14px] leading-relaxed text-[var(--p-ink-2)]">
          <b>Start with Google Maps.</b> Open the place in Google Maps, tap <b>Share</b>, then <b>Copy link</b>, and paste it here. Or type its name and
          pick it from the list.
        </div>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--p-muted)]" />
          <input
            className="pl-input !pl-12"
            value={input}
            autoFocus
            placeholder="https://maps.app.goo.gl/… or the place's name"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void find()}
          />
        </div>
        <button type="button" className="pl-btn" disabled={finding} onClick={() => void find()}>
          {finding ? "Looking on Google…" : "Find it"}
        </button>

        {notice ? (
          <div role="alert" className="pl-fade flex gap-2.5 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
            <IconWarn className="mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}

        {results ? (
          <div className="pl-fade grid gap-2">
            <div className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">On Google</div>
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={finding}
                onClick={() => void pick(r.id)}
                className="pl-tap flex items-start gap-3 rounded-2xl border-[1.5px] border-[var(--p-line)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--p-accent)]"
              >
                <IconPin className="mt-0.5 shrink-0 text-[var(--p-accent)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[15.5px] font-bold">{r.name}</span>
                  <span className="block text-[13px] text-[var(--p-muted)]">{r.address}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {onCancel ? (
          <button type="button" className="pl-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    );
  }

  /* ── Already on Duro ──────────────────────────────────────────────── */
  if (found.existing) {
    return (
      <div className="pl-fade flex flex-col gap-4">
        <div className="flex gap-3 rounded-2xl bg-[var(--p-ok-soft)] p-4 text-[14.5px] text-[#0b4f4a]">
          <IconCheck className="mt-0.5 shrink-0" />
          <span>
            <b>{found.existing.name}</b> is already on Duro{found.existing.area ? `, in ${found.existing.area}` : ""}. No need to add it: choose it when you put
            your night on.
          </span>
        </div>
        {onUseExisting ? (
          <button type="button" className="pl-btn" onClick={() => onUseExisting(found.existing!.id)}>
            Put my night there
          </button>
        ) : null}
        <button type="button" className="pl-btn-ghost" onClick={() => setFound(null)}>
          It is a different place
        </button>
      </div>
    );
  }

  /* ── 2. Check what Google said, and file it ───────────────────────── */
  return (
    <div className="pl-fade flex flex-col gap-5">
      <div className="flex gap-3 rounded-2xl border-[1.5px] border-[var(--p-ok)] bg-[var(--p-ok-soft)] p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--p-ok)] text-white">
          <IconPin size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-[var(--p-ok)]">{found.placeId ? "Found on Google" : "Pin from your link"}</div>
          <div className="text-[16px] font-bold">{found.placeId ? found.name : "A spot with no Google listing"}</div>
          {found.address ? <div className="text-[13.5px] text-[var(--p-ink-2)]">{found.address}</div> : null}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] font-bold">
            {found.mapsUrl ? (
              <a href={found.mapsUrl} target="_blank" rel="noreferrer" className="text-[var(--p-ok)] underline">
                Check it on Google Maps ↗
              </a>
            ) : null}
            <button type="button" className="text-[var(--p-muted)] underline" onClick={() => setFound(null)}>
              Not this place
            </button>
          </div>
        </div>
      </div>

      {!found.city ? (
        <div className="flex gap-2.5 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
          <IconWarn className="mt-0.5 shrink-0" />
          <span>This place is outside Ghana, so it cannot be added.</span>
        </div>
      ) : null}

      <label className="block">
        <span className="pl-label">What should we call it?</span>
        <input className="pl-input" value={name} maxLength={80} placeholder="The Lawn at Alliance Française" onChange={(e) => setName(e.target.value)} />
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
                type === t.value ? "border-[var(--p-accent)] bg-[var(--p-accent-soft)]" : "border-[var(--p-line)] bg-white hover:border-[var(--p-accent)]"
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

      <AreaPicker areas={areas} value={area} onChange={setArea} point={{ lat: found.lat, lng: found.lng }} proposal={found.areaProposal} />

      <label className="block">
        <span className="pl-label">In a sentence (optional)</span>
        <textarea
          className="pl-input"
          value={description}
          maxLength={300}
          placeholder="An open lawn behind the main building, tables under the trees."
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div>
        <span className="pl-label">A picture of the place (optional)</span>
        <PosterUpload value={image} onChange={setImage} folder="locations" label="Add a photo" hint="The place itself. Your poster goes on the night." aspect="aspect-[16/9]" />
      </div>

      {error ? (
        <p role="alert" className="text-[14px] font-semibold text-[var(--p-accent-dark)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button type="button" className="pl-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
        <button type="button" className="pl-btn" onClick={() => void create()} disabled={busy || !found.city}>
          {busy ? "Adding…" : "Add this place"}
        </button>
      </div>
    </div>
  );
}

/**
 * The part of town: Google's suggestion, one from the list, or a new one
 * Google confirms is near the place.
 */
function AreaPicker({
  areas,
  value,
  onChange,
  point,
  proposal,
}: {
  areas: { id: string; name: string }[];
  value: AreaChoice | null;
  onChange: (a: AreaChoice | null) => void;
  point: { lat: number; lng: number };
  proposal: string | null;
}) {
  const [editing, setEditing] = useState(!value);
  const [typed, setTyped] = useState(value ? "" : proposal ?? "");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const needle = typed.trim().toLowerCase();
  const matches = needle ? areas.filter((a) => a.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  const exact = areas.some((a) => a.name.toLowerCase() === needle);

  async function addNew() {
    setChecking(true);
    setProblem(null);
    const r = await ask<{ ok?: boolean; area?: { id: string | null; name: string }; message?: string }>({
      action: "area",
      name: typed.trim(),
      lat: point.lat,
      lng: point.lng,
    });
    setChecking(false);
    if (r.error) return setProblem(r.error);
    if (!r.ok || !r.area) return setProblem(r.message ?? "Google does not know that part of town near this place.");
    onChange({ id: r.area.id, name: r.area.name, how: r.area.id ? "list" : "new" });
    setEditing(false);
  }

  return (
    <div>
      <span className="pl-label">Part of town</span>
      {value && !editing ? (
        <div className="pl-fade flex items-center gap-3 rounded-2xl border-[1.5px] border-[var(--p-line)] bg-white px-4 py-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--p-ok)] text-white">
            <IconCheck size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-bold">{value.name}</span>
            <span className="block text-[13px] text-[var(--p-muted)]">
              {value.how === "google" ? "From the address on Google" : value.how === "new" ? "New part of town, confirmed on Google" : "From the list"}
            </span>
          </span>
          <button
            type="button"
            className="text-[14px] font-bold text-[var(--p-accent)]"
            onClick={() => {
              setEditing(true);
              setTyped("");
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            className="pl-input"
            value={typed}
            placeholder="East Legon, Osu, Adum…"
            onChange={(e) => {
              setTyped(e.target.value);
              setProblem(null);
            }}
          />
          {matches.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onChange({ id: a.id, name: a.name, how: "list" });
                setEditing(false);
              }}
              className="pl-tap flex items-center justify-between rounded-2xl border-[1.5px] border-[var(--p-line)] bg-white px-4 py-3 text-left text-[15px] font-semibold transition-colors hover:border-[var(--p-accent)]"
            >
              {a.name}
              <span className="text-[13px] font-bold text-[var(--p-accent)]">Use</span>
            </button>
          ))}
          {needle.length >= 3 && !exact ? (
            <button
              type="button"
              disabled={checking}
              onClick={() => void addNew()}
              className="pl-tap flex items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--p-line)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--p-accent)]"
            >
              <span className="text-[15px] font-bold">{checking ? `Checking ${typed.trim()} on Google…` : `Add "${typed.trim()}" as a new part of town`}</span>
            </button>
          ) : null}
          {problem ? (
            <p role="alert" className="pl-fade text-[14px] font-semibold text-[var(--p-warn)]">
              {problem}
            </p>
          ) : null}
          <p className="pl-hint">Type to find it on the list. Not there? Add it, and we check it with Google first.</p>
          {value ? (
            <button type="button" className="self-start text-[14px] font-bold text-[var(--p-muted)] underline" onClick={() => setEditing(false)}>
              Keep {value.name}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
