"use client";

import { IconPin, IconTicket } from "./icons";
import { WholeImage } from "./WholeImage";
import { friendlyDate, friendlyTime, kindEmoji, kindLabel } from "./nights";
import type { Audience } from "@/lib/types";

export interface PreviewData {
  title: string;
  category: string;
  date: string;
  time: string;
  placeName: string;
  area: string;
  cost: number | null;
  audience: Audience;
  description: string;
  image: string;
  bookingUrl: string;
  organiser: { name: string; logoUrl: string | null };
}

/**
 * The card their night becomes inside somebody's plan in the app.
 *
 * Drawn after the app's StopCard: poster first, the night as the heading and
 * the venue under it, "on this date only", who is hosting, and the door. It
 * is the answer to the question every planner has and the old form never
 * answered: what will people actually see?
 */
export function NightPreview({ data, party = 2 }: { data: PreviewData; party?: number }) {
  const title = data.title.trim() || "Your night's name";
  const entry =
    data.cost == null ? null : data.cost === 0 ? `Entry, free` : `Entry`;
  const entryTotal = data.cost == null ? null : Math.round(data.cost * party);

  return (
    <div className="overflow-hidden rounded-[22px] bg-white text-left text-[#1c1216] shadow-[0_18px_40px_-22px_rgb(28_18_22/0.45)] ring-1 ring-black/5">
      {/* The app's poster strip is about 343 by 240, so the preview is that shape. */}
      <div className="relative aspect-[10/7] w-full overflow-hidden bg-[var(--p-sunken)]">
        {data.image ? (
          <WholeImage src={data.image} alt="Your poster" className="h-full w-full" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#fde8ef,#f4eeea_55%,#fdf1dc)]">
            <div className="text-center">
              <div className="pl-float text-[54px] leading-none">{kindEmoji(data.category)}</div>
              <div className="mt-3 text-[13px] font-semibold text-[var(--p-muted)]">Your poster goes here</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-bold tracking-[0.08em] text-[var(--p-ok)]">EVENT</span>
          <span className="tabular-nums text-[var(--p-muted)]">
            {data.date ? friendlyDate(data.date) : "Pick a date"}
            {data.time ? ` · ${friendlyTime(data.time)}` : ""}
          </span>
        </div>

        <div className="text-[21px] font-bold leading-tight">{title}</div>

        <div className="flex items-center gap-1.5 text-[13.5px] text-[var(--p-muted)]">
          <IconPin size={14} />
          <span className="truncate">
            {data.placeName ? `${data.placeName}${data.area ? ` · ${data.area}` : ""}` : "Where it is"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--p-ok)]">
          <IconTicket size={14} />
          On this date only{data.time ? ` · starts ${friendlyTime(data.time)}` : ""}
        </div>

        <div className="flex items-center gap-2 text-[13.5px] text-[var(--p-muted)]">
          {data.organiser.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.organiser.logoUrl} alt="" className="h-6 w-6 rounded-md bg-white object-contain ring-1 ring-black/10" />
          ) : null}
          <span>
            Hosted by <b className="text-[#1c1216]">{data.organiser.name}</b>
          </span>
        </div>

        {data.audience !== "everyone" ? (
          <span className="self-start rounded-full bg-[var(--p-ok-soft)] px-2.5 py-1 text-[12.5px] font-bold text-[var(--p-ok)]">
            {data.audience === "women" ? "Ladies only" : "Men only"}
          </span>
        ) : null}

        {data.description.trim() ? (
          <p className="text-[14.5px] leading-relaxed text-[var(--p-ink-2)]">{data.description.trim()}</p>
        ) : null}

        <div className="mt-1 border-t border-[var(--p-line)] pt-2.5">
          {entry ? (
            <div className="flex items-center justify-between text-[14.5px]">
              <span>{entry}</span>
              <span className="flex items-center gap-5 tabular-nums">
                <span className="text-[var(--p-muted)]">x{party}</span>
                <span className="min-w-[70px] text-right">GHS {entryTotal}</span>
              </span>
            </div>
          ) : (
            <div className="text-[13.5px] text-[var(--p-warn)]">No entry price yet, so plans with a budget leave this night out.</div>
          )}
        </div>

        {data.bookingUrl.trim() ? (
          <div className="mt-1 rounded-xl bg-[var(--p-ok)] py-2.5 text-center text-[14px] font-bold text-white">Tickets</div>
        ) : null}

        <div className="text-[11.5px] text-[var(--p-muted)]">{kindLabel(data.category)} · shown for a plan for {party}</div>
      </div>
    </div>
  );
}
