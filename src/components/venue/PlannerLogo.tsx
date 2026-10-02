"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A planner's logo: upload, replace or remove.
 *
 * It goes on their event cards in people's plans (migration 0071), so the
 * preview shows it the way the card does: small, square, on white.
 */
export function PlannerLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(logoUrl);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function send(body: FormData) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/venue/logo", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(json.error ?? "That did not work. Try again.");
        return;
      }
      setUrl(json.url ?? null);
      setNote(json.url ? "Saved. It is on your events now." : "Removed.");
      router.refresh();
    } catch {
      setNote("Could not reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File) {
    const body = new FormData();
    body.append("file", file);
    void send(body);
  }

  function remove() {
    if (!confirm("Remove your logo from your events?")) return;
    const body = new FormData();
    body.append("remove", "1");
    void send(body);
  }

  return (
    <div className="card p-5">
      <div className="text-[15px] font-bold">Your logo</div>
      <p className="mt-0.5 text-[13px] text-mutedbrown">
        Shown on your event&apos;s card whenever it is in somebody&apos;s plan, beside &ldquo;Hosted by {name}&rdquo;. A square
        PNG or JPEG works best, up to 2 MB. Plans made from now on carry it; ones already saved keep the card they were made with.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-black/10">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`${name} logo`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[28px] font-bold text-mutedbrown">{name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btnsm px-5" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Working…" : url ? "Replace" : "Upload a logo"}
          </button>
          {url ? (
            <button className="btn2 btnsm" disabled={busy} onClick={remove}>
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
      </div>
      {note ? <p className="mt-3 text-[13px] font-semibold">{note}</p> : null}
    </div>
  );
}
