"use client";

import { useRef, useState } from "react";
import type { VenueDraft } from "@/lib/research";

/**
 * Look a venue up and fill the form from what comes back.
 *
 * Adding a venue by hand means filling seventeen fields, most of which you
 * have to go and look up anyway. This does the looking up and hands the answer
 * to the form as a draft — nothing is saved, and every field stays editable,
 * because the point is to remove the typing rather than the judgement.
 *
 * Anything the research was unsure about is shown before you apply it rather
 * than after, and the sources are listed so a claim can be checked rather than
 * taken on trust.
 */
export function VenueResearch({
  initialName,
  onApply,
}: {
  initialName: string;
  onApply: (draft: VenueDraft) => void;
}) {
  const [name, setName] = useState(initialName);
  const [areaHint, setAreaHint] = useState("");
  const [thorough, setThorough] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<VenueDraft | null>(null);

  /*
   * Research runs for up to a few minutes. Without this the tab could be left
   * holding a request nobody is waiting for any more, which is a bill for an
   * answer that gets discarded.
   */
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    if (name.trim().length < 2) {
      setError("Type a venue name first.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setError(null);
    setDraft(null);

    try {
      const res = await fetch("/api/admin/research-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), areaHint: areaHint.trim(), thorough }),
        signal: controller.signal,
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Lookup failed.");
        return;
      }
      setDraft(json.draft as VenueDraft);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError("Could not reach the lookup service.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setBusy(false);
  }

  return (
    <div className="rounded-bar border border-line bg-cream/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[16px] font-bold">Look it up</h2>
        <span className="text-[12px] text-mutedbrown">Nothing is saved until you save.</span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_auto]">
        <input
          className="inp"
          placeholder="Venue name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <input
          className="inp"
          placeholder="Area (optional)"
          value={areaHint}
          onChange={(e) => setAreaHint(e.target.value)}
        />
        {busy ? (
          <button type="button" className="btn2 btnsm" onClick={cancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="btn btnsm" onClick={run}>
            Look it up
          </button>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-[13px] text-mutedbrown">
        <input
          type="checkbox"
          checked={thorough}
          onChange={(e) => setThorough(e.target.checked)}
        />
        Search harder — for chains, renamed places, or several branches
      </label>

      {busy ? (
        <p className="mt-3 text-[13px] text-mutedbrown">
          Searching… this takes up to a couple of minutes.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-staletext">{error}</p> : null}

      {draft ? <DraftPreview draft={draft} onApply={onApply} /> : null}
    </div>
  );
}

function DraftPreview({
  draft,
  onApply,
}: {
  draft: VenueDraft;
  onApply: (d: VenueDraft) => void;
}) {
  if (!draft.found) {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[14px] font-semibold text-staletext">Nothing found in Accra.</p>
        {draft.warnings.map((w, i) => (
          <p key={i} className="mt-1 text-[13px] text-mutedbrown">
            {w}
          </p>
        ))}
        <p className="mt-2 text-[13px] text-mutedbrown">
          Fill the form in by hand, or try the name as it appears on their signage.
        </p>
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Name", draft.canonical_name ?? "—"],
    ["Type", draft.type ?? "—"],
    ["Area", draft.area_name ?? "—"],
    ["Address", draft.address ?? "—"],
    ["Price band", draft.price_band ?? "—"],
    [
      "Per person",
      draft.is_free
        ? "Free to enter"
        : draft.avg_cost_per_person_ghs > 0
          ? `GHS ${draft.avg_cost_per_person_ghs}`
          : "not known — goes to the unpriced queue",
    ],
    ["Phone", draft.phone ?? "—"],
    ["Coordinates", draft.lat != null && draft.lng != null ? `${draft.lat}, ${draft.lng}` : "—"],
  ];

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold">What it found</h3>
        <span className="text-[12px] text-mutedbrown">
          confidence {Math.round(draft.confidence * 100)}%
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-[13px]">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-mutedbrown">{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>

      {draft.description ? (
        <p className="mt-3 text-[13px] leading-relaxed">{draft.description}</p>
      ) : null}

      {draft.price_signal ? (
        <p className="mt-3 rounded-bar bg-white p-3 text-[13px]">
          <span className="font-semibold">On price: </span>
          {draft.price_signal}
          <span className="mt-1 block text-[12px] text-mutedbrown">
            {draft.avg_cost_per_person_ghs > 0
              ? "A figure was filled in above — check this quote agrees with it before saving."
              : "Not filled in automatically — read it, then set the figure yourself or add the menu."}
          </span>
        </p>
      ) : null}

      {draft.warnings.length ? (
        <ul className="mt-3 space-y-1">
          {draft.warnings.map((w, i) => (
            <li key={i} className="text-[13px] text-staletext">
              ⚠ {w}
            </li>
          ))}
        </ul>
      ) : null}

      {draft.sources.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] text-mutedbrown">
            {draft.sources.length} source{draft.sources.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {draft.sources.map((s, i) => (
              <li key={i} className="text-[13px]">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-line underline-offset-2"
                >
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <button type="button" className="btn btnsm mt-4" onClick={() => onApply(draft)}>
        Fill the form
      </button>
      <span className="ml-3 text-[12px] text-mutedbrown">Phone still needs review.</span>
    </div>
  );
}
