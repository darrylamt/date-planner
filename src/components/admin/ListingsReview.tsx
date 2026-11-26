"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VenuePicker } from "@/components/admin/VenuePicker";

export type Listing = {
  id: string;
  source: "aya" | "passa";
  url: string;
  title: string;
  starts_at: string;
  place_name: string | null;
  place_address: string | null;
  organiser: string | null;
  price_ghs: number | null;
  sold_out: boolean;
  image_url: string | null;
  description: string | null;
  suggested_venue_id: string | null;
};

/** The catalogue's kinds of event, for the new event. */
export const LISTING_KINDS = ["nightlife", "live_music", "music", "festival", "arts", "food", "workshop", "sports", "wellness", "outdoor", "tours", "other"];

/** A first guess at the kind from the title; the reviewer changes it if it is wrong. */
function guessKind(title: string): string {
  const t = title.toLowerCase();
  if (/concert|live band|live music|acoustic|unplugged|jazz|choir/.test(t)) return "live_music";
  if (/festival|fest\b|carnival/.test(t)) return "festival";
  if (/exhibit|gallery|art\b|paint|poetry|theatre|theater|comedy|film|screening/.test(t)) return "arts";
  if (/brunch|food|dinner|tasting|wine|cocktail/.test(t)) return "food";
  if (/workshop|class|masterclass|bootcamp/.test(t)) return "workshop";
  if (/run|fitness|football|padel|yoga|sport/.test(t)) return "sports";
  if (/party|rave|night|vibes|turn ?up|dj|lounge|club|takeover|all (white|black)/.test(t)) return "nightlife";
  return "other";
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/*
 * Each listing as a card: what the site says, the venue it looks like (to
 * confirm or change), the kind and the price, then Approve or Reject. Busy,
 * Done or the reason on every button.
 */
export function ListingsReview({
  listings,
  venues,
  areaNames,
}: {
  listings: Listing[];
  venues: { id: string; name: string; area_id: string }[];
  areaNames: Record<string, string>;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, { venue: string; kind: string; price: string; busy?: string; error?: string; done?: string }>>(() =>
    Object.fromEntries(
      listings.map((l) => [l.id, { venue: l.suggested_venue_id ?? "", kind: guessKind(l.title), price: l.price_ghs == null ? "" : String(l.price_ghs) }]),
    ),
  );
  const set = (id: string, patch: Partial<(typeof state)[string]>) => setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  async function act(l: Listing, action: "approve" | "reject") {
    const s = state[l.id];
    if (action === "approve" && !s.venue) return set(l.id, { error: "Choose the venue first." });
    set(l.id, { busy: action, error: undefined });
    const res = await fetch("/api/admin/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "approve"
          ? { action, id: l.id, venueId: s.venue, category: s.kind, price: s.price.trim() === "" ? null : Number(s.price) }
          : { action, id: l.id },
      ),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res?.ok && json?.ok) {
      set(l.id, { busy: undefined, done: action === "approve" ? "Approved: it's an event now." : "Rejected." });
      router.refresh();
    } else set(l.id, { busy: undefined, error: json?.error ?? "That didn't work. Try again." });
  }

  if (!listings.length) return <p className="mt-6 text-mutedbrown">Nothing waiting. New listings arrive every morning.</p>;

  return (
    <div className="mt-6 grid gap-4">
      {listings.map((l) => {
        const s = state[l.id];
        return (
          <div key={l.id} className="rounded-card border border-line p-4">
            <div className="flex gap-4">
              {l.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.image_url} alt="" className="h-[96px] w-[76px] shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-mutedbrown">
                  {l.source === "aya" ? "Aya Tickets" : "passa"} ·{" "}
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-flame underline">
                    open the page
                  </a>
                </div>
                <div className="mt-0.5 text-[17px] font-bold leading-snug">{l.title}</div>
                <div className="text-[14px] text-cocoa">{when(l.starts_at)}</div>
                <div className="text-[14px] text-cocoa">{[l.place_name, l.place_address].filter(Boolean).join(" · ") || "No place given"}</div>
                <div className="text-[13px] text-mutedbrown">
                  {l.organiser ? `By ${l.organiser} · ` : ""}
                  {l.price_ghs != null ? `From GHS ${l.price_ghs}${l.sold_out ? " (sold out)" : ""}` : "No price on the page: check it and type it below"}
                </div>
                {l.description ? (
                  <details className="mt-1 text-[13px] text-mutedbrown">
                    <summary className="cursor-pointer">What the page says</summary>
                    <p className="mt-1 whitespace-pre-line">{l.description}</p>
                  </details>
                ) : null}
              </div>
            </div>

            {s.done ? (
              <div className="mt-3 text-[14px] font-semibold text-cocoa">{s.done}</div>
            ) : (
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_170px_120px]">
                <VenuePicker venues={venues} areaName={(id) => areaNames[id]} value={s.venue} onChange={(id) => set(l.id, { venue: id })} />
                <select className="inp h-[42px]" value={s.kind} onChange={(e) => set(l.id, { kind: e.target.value })}>
                  {LISTING_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <input
                  className="inp h-[42px]"
                  inputMode="decimal"
                  placeholder="Price GHS"
                  value={s.price}
                  onChange={(e) => set(l.id, { price: e.target.value.replace(/[^0-9.]/g, "") })}
                />
                <div className="flex flex-wrap items-center gap-2 md:col-span-3">
                  <button type="button" className="btn btnsm px-6" disabled={Boolean(s.busy)} onClick={() => void act(l, "approve")}>
                    {s.busy === "approve" ? "Approving…" : "Approve"}
                  </button>
                  <button type="button" className="btn2 btnsm" disabled={Boolean(s.busy)} onClick={() => void act(l, "reject")}>
                    {s.busy === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                  {s.error ? <span className="text-[13px] text-flame">{s.error}</span> : null}
                  {!s.venue ? <span className="text-[13px] text-mutedbrown">The planner only uses events at a catalogue venue: choose it above.</span> : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
