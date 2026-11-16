"use client";

import { useState } from "react";
import Link from "next/link";

export type OutreachVenue = {
  id: string;
  name: string;
  area: string | null;
  instagram: string;
  menu: string;
  status: "todo" | "messaged" | "agreed" | "posting" | "declined";
  notes: string;
  pull: number;
};

const STATUS: { id: OutreachVenue["status"]; label: string }[] = [
  { id: "todo", label: "To ask" },
  { id: "messaged", label: "Messaged" },
  { id: "agreed", label: "Agreed" },
  { id: "posting", label: "Posting" },
  { id: "declined", label: "Declined" },
];

/** The first message to a venue, from Duro!'s Instagram. Short, specific, and the offer up front. */
const message = (v: OutreachVenue) =>
  [
    `Hi ${v.name}! We're Duro!, the app people in Accra use to plan a night out. You're on it, and people keep you in their plans.`,
    "",
    `Your menu and prices have their own page: ${v.menu}`,
    "",
    "We'd love to feature you. If you put that link in your bio (as \"Menu and prices\") and repost a Duro! post that tags you once a month, we'll give you three months of Duro! Portal Pro free: see how many people plan around you, and update your menu and photos yourself.",
    "",
    "We've attached a post we made for you. Interested?",
  ].join("\n");

export function OutreachRow({ venue }: { venue: OutreachVenue }) {
  const [status, setStatus] = useState(venue.status);
  const [notes, setNotes] = useState(venue.notes);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function save(next: OutreachVenue["status"], nextNotes = notes) {
    setStatus(next);
    setState("saving");
    const res = await fetch("/api/admin/social/outreach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ venueId: venue.id, status: next, notes: nextNotes }),
    }).catch(() => null);
    setState(res?.ok ? "saved" : "error");
    if (res?.ok) setTimeout(() => setState("idle"), 1500);
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold">{venue.name}</div>
          <div className="text-[13px] text-mutedbrown">
            {venue.area ? `${venue.area} · ` : ""}
            <a href={`https://instagram.com/${venue.instagram}`} target="_blank" rel="noopener" className="font-semibold text-flame">
              @{venue.instagram}
            </a>
          </div>
        </div>
        <select
          className="rounded-lg border border-black/15 bg-white px-2 py-1.5 text-[14px]"
          value={status}
          onChange={(e) => void save(e.target.value as OutreachVenue["status"])}
          aria-label={`Status for ${venue.name}`}
        >
          {STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="w-[60px] text-[12px] text-mutedbrown">{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved" : ""}</span>
        <button type="button" className="btn2 btnsm" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Message"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 grid gap-3">
          <pre className="whitespace-pre-wrap rounded-lg bg-black/[0.03] p-3 text-[13px] leading-relaxed">{message(venue)}</pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btnsm"
              onClick={async () => {
                await navigator.clipboard.writeText(message(venue));
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? "Copied" : "Copy message"}
            </button>
            <a href={`https://ig.me/m/${venue.instagram}`} target="_blank" rel="noopener" className="btn2 btnsm">
              Open their DMs
            </a>
            <Link href={`/admin/social/flyers?venue=${venue.id}`} className="btn2 btnsm">
              Make their flyer
            </Link>
            <a href={venue.menu} target="_blank" rel="noopener" className="btn2 btnsm">
              Their menu page
            </a>
          </div>
          <label className="grid gap-1">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-mutedbrown">Notes</span>
            <textarea
              className="min-h-[60px] rounded-lg border border-black/15 bg-white px-3 py-2 text-[14px]"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== venue.notes && void save(status, notes)}
              placeholder="Who replied, what they said, when to follow up"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
