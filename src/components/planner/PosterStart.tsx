"use client";

import { useRef, useState } from "react";
import { shrink } from "@/lib/menuRead";
import type { FlyerDraft } from "@/lib/flyerReader";
import { IconSparkle } from "./icons";

/**
 * "Have a poster? Start from it."
 *
 * The poster says the name, the date, the time, the place and the price, and
 * the form asked for each of them again. One picture: it is uploaded as the
 * night's poster and read (/api/ai/flyer, Gemini), and the form fills in.
 * Nothing is saved; the person checks each field and publishes as before.
 *
 * Used by the planner's night editor, the venue's events and the admin's.
 */
export function PosterStart({
  onDraft,
  uploadUrl = "/api/venue/upload",
  compact = false,
}: {
  /** What was read, and the poster's new URL. */
  onDraft: (draft: FlyerDraft, imageUrl: string) => void;
  /** Admins upload through their own route. */
  uploadUrl?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "reading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function start(file: File) {
    setError(null);
    setState("uploading");
    try {
      // The poster as the night's picture, at a size that still reads well on a phone.
      const blob = await shrink(file, 2000);
      const body = new FormData();
      body.append("file", blob instanceof File ? blob : new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || "image/jpeg" }));
      body.append("folder", "events");
      const up = await fetch(uploadUrl, { method: "POST", body });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok || !upJson.url) throw new Error(upJson.error ?? "The poster didn't upload. Try again.");

      setState("reading");
      const res = await fetch("/api/ai/flyer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl: upJson.url }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.draft) {
        // The poster is still theirs to use, even when it could not be read.
        onDraft({ ...EMPTY_DRAFT }, upJson.url);
        throw new Error(`${json.error ?? "We couldn't read the poster."} It's added as your poster; fill in the rest by hand.`);
      }
      onDraft(json.draft as FlyerDraft, upJson.url);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setState("idle");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const busy = state === "uploading" || state === "reading";
  return (
    <div className={`rounded-2xl border-2 border-dashed border-[var(--p-line)] bg-[var(--p-accent-soft)] ${compact ? "p-3.5" : "p-4"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--p-accent)]">
          <IconSparkle size={20} />
        </span>
        <div className="min-w-[180px] flex-1">
          <div className="text-[15px] font-bold">
            {state === "done" ? "Filled in from your poster" : "Have a poster? Start from it"}
          </div>
          <div className="text-[13px] text-[var(--p-muted)]">
            {state === "uploading"
              ? "Uploading your poster…"
              : state === "reading"
                ? "Reading the name, dates, time, place and price…"
                : state === "done"
                  ? "Check every field before you publish. Posters leave things out."
                  : "We read the name, dates, time, place and price, and fill them in for you."}
          </div>
        </div>
        <button type="button" className="pl-btn-soft !min-h-[40px] !px-4 !text-[14px]" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Working…" : state === "done" ? "Use another poster" : "Choose poster"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void start(f);
          }}
        />
      </div>
      {error ? <div className="mt-2 text-[13px] font-semibold text-[var(--p-warn)]">{error}</div> : null}
    </div>
  );
}

const EMPTY_DRAFT: FlyerDraft = {
  isEvent: false,
  title: "",
  kind: "other",
  otherKind: "",
  dates: [],
  time: "",
  endTime: "",
  venueName: "",
  area: "",
  costMode: "unknown",
  cost: 0,
  bookingUrl: "",
  phone: "",
  audience: "everyone",
  vibes: [],
  description: "",
  dressCode: "",
};
