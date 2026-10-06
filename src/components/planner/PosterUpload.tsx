"use client";

import { useRef, useState } from "react";
import { IconImage } from "./icons";
import { WholeImage } from "./WholeImage";

/**
 * A picture, from the phone's camera roll in one tap.
 *
 * A poster exists as an image on a phone, so the whole box is the button.
 * Pasting a link is still possible, folded away, for the planner whose
 * poster lives on their website.
 */
export function PosterUpload({
  value,
  onChange,
  folder = "events",
  label = "Add your poster",
  hint = "JPEG or PNG, up to 5 MB. Portrait or square both work.",
  aspect = "aspect-[4/3]",
}: {
  value: string;
  onChange: (url: string) => void;
  folder?: "events" | "locations" | "venues";
  label?: string;
  hint?: string;
  aspect?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", folder);
      const res = await fetch("/api/venue/upload", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That did not upload. Try again.");
        return;
      }
      onChange(data.url as string);
    } catch {
      setError("That did not upload. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={`pl-tap group relative block w-full overflow-hidden rounded-[20px] border-2 border-dashed transition-colors ${aspect} ${
          value ? "border-transparent" : "border-[var(--p-line)] bg-white hover:border-[var(--p-accent)]"
        }`}
      >
        {value ? (
          <>
            <WholeImage src={value} alt="Your poster" className="h-full w-full" />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3.5 py-2 text-[13px] font-bold text-white backdrop-blur">
              {busy ? "Uploading…" : "Change"}
            </span>
          </>
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span
              className={`grid h-16 w-16 place-items-center rounded-2xl bg-[var(--p-accent-soft)] text-[var(--p-accent)] transition-transform group-hover:scale-105 ${
                busy ? "animate-pulse" : ""
              }`}
            >
              <IconImage size={30} />
            </span>
            <span className="text-[16px] font-bold">{busy ? "Uploading…" : label}</span>
            <span className="pl-hint max-w-[260px]">{hint}</span>
          </span>
        )}
      </button>

      {error ? <p className="mt-2 text-[13.5px] font-semibold text-[var(--p-accent-dark)]">{error}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {value ? (
          <button type="button" className="text-[13.5px] font-semibold text-[var(--p-muted)] underline" onClick={() => onChange("")}>
            Remove it
          </button>
        ) : null}
        <button type="button" className="text-[13.5px] font-semibold text-[var(--p-muted)] underline" onClick={() => setShowLink((s) => !s)}>
          {showLink ? "Hide the link box" : "Paste a link instead"}
        </button>
      </div>
      {showLink ? (
        <input
          className="pl-input pl-fade mt-2"
          placeholder="https://…"
          value={value}
          inputMode="url"
          onChange={(e) => onChange(e.target.value.trim())}
        />
      ) : null}

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
