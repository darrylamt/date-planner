"use client";

import { useRef, useState } from "react";

/**
 * A picture, entered either way.
 *
 * Every image in the admin has been a bare text box holding somebody else's
 * URL. That is genuinely the right answer some of the time, a venue's own site
 * has the best photograph of it, and pasting the link is two seconds. It is
 * the wrong answer for the poster for Saturday's event, which exists as a
 * picture on a phone and has no URL to paste at all.
 *
 * So both, in one control, with the preview doing the work of telling you
 * which you got. The box stays editable after an upload, because the URL a
 * file lands at is a fact worth being able to see and copy.
 */
export function ImageField({
  label,
  value,
  onChange,
  folder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  /** Sorts uploads in storage: "venues", "events", "gifts". */
  folder: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * Reset on every new src. Without it a broken URL stays marked broken after
   * being replaced with a good one, because the img element only fires onError
   * again if it actually tries to load again.
   */
  const [broken, setBroken] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", folder);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That did not upload.");
        return;
      }
      setBroken(false);
      onChange(data.url as string);
    } catch {
      setError("That did not upload. Check your connection.");
    } finally {
      setBusy(false);
      // So picking the same file twice in a row still fires onChange.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flbl">{label}</span>

      <div className="flex items-start gap-3">
        {/* The preview is the answer to "did that work", so it is always
            present: a dashed empty box reads as "nothing here yet" rather
            than as a layout that jumps once an image arrives. */}
        <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-cream/60">
          {value && !broken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <span className="px-1 text-center text-[11px] leading-tight text-mutedbrown">
              {broken ? "Won't load" : "No image"}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            className="inp"
            placeholder="Paste a URL, or upload a file"
            value={value}
            onChange={(e) => {
              setBroken(false);
              onChange(e.target.value);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-line px-2.5 py-1 text-[12.5px] font-semibold text-cocoa transition-colors hover:border-flame hover:text-flame disabled:opacity-50"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? "Uploading…" : "Upload a file"}
            </button>

            {value ? (
              <button
                type="button"
                className="rounded-md border border-line px-2.5 py-1 text-[12.5px] font-semibold text-mutedbrown transition-colors hover:border-flame hover:text-flame"
                onClick={() => {
                  setBroken(false);
                  onChange("");
                }}
              >
                Remove
              </button>
            ) : null}

            {hint && !error ? (
              <span className="text-[12px] text-mutedbrown">{hint}</span>
            ) : null}
            {error ? <span className="text-[12px] font-semibold text-flame">{error}</span> : null}
          </div>
        </div>
      </div>

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

/**
 * The pictures after the first one.
 *
 * Kept as a list rather than a repeated ImageField because the order is the
 * order they appear on the stop card, so moving one has to be possible, and a
 * column of identical boxes gives no way to say which is second.
 */
export function ImageListField({
  label,
  values,
  onChange,
  folder,
  hint,
}: {
  label: string;
  values: string[];
  onChange: (urls: string[]) => void;
  folder: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadMany(files: FileList) {
    setBusy(true);
    setError(null);
    const added: string[] = [];
    try {
      // One at a time. The limit here is somebody's upload speed in Accra, not
      // the server, and five parallel requests on a slow connection fail
      // together rather than five times faster.
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append("file", file);
        body.append("folder", folder);
        const res = await fetch("/api/admin/upload", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "One of those did not upload.");
          break;
        }
        added.push(data.url as string);
      }
    } catch {
      setError("That did not upload. Check your connection.");
    } finally {
      // Whatever did land is kept: losing four good uploads because the fifth
      // was a PDF is the sort of thing that makes people stop uploading.
      if (added.length) onChange([...values, ...added]);
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= values.length) return;
    const next = [...values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flbl">{label}</span>

      {values.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {values.map((url, i) => (
            <div key={`${url}-${i}`} className="flex items-center gap-2">
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-cream/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </div>
              <input
                className="inp min-w-0 flex-1"
                value={url}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = e.target.value;
                  onChange(next);
                }}
              />
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label="Move earlier"
                  className="rounded-md border border-line px-2 py-1 text-[12px] text-cocoa transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move later"
                  className="rounded-md border border-line px-2 py-1 text-[12px] text-cocoa transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
                  disabled={i === values.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  className="rounded-md border border-line px-2 py-1 text-[12px] text-mutedbrown transition-colors hover:border-flame hover:text-flame"
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-line px-2.5 py-1 text-[12.5px] font-semibold text-cocoa transition-colors hover:border-flame hover:text-flame disabled:opacity-50"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Uploading…" : "Add pictures"}
        </button>
        <button
          type="button"
          className="rounded-md border border-line px-2.5 py-1 text-[12.5px] font-semibold text-cocoa transition-colors hover:border-flame hover:text-flame"
          onClick={() => onChange([...values, ""])}
        >
          Add a URL
        </button>
        {hint && !error ? <span className="text-[12px] text-mutedbrown">{hint}</span> : null}
        {error ? <span className="text-[12px] font-semibold text-flame">{error}</span> : null}
      </div>

      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void uploadMany(files);
        }}
      />
    </div>
  );
}
