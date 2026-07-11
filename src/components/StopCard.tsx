"use client";

import { SmartImage } from "./SmartImage";
import { ghs } from "@/lib/format";
import type { ItineraryStop } from "@/lib/types";

/** Venue/stop card from the style tile (.stop) — mobile stacked, desktop side-by-side. */
export function StopCard({
  stop,
  onSwap,
  swapping = false,
  dimmed = false,
  highlight = false,
  desktopRow = false,
}: {
  stop: ItineraryStop;
  onSwap?: () => void;
  swapping?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  desktopRow?: boolean;
}) {
  if (swapping) {
    // Swap-in-progress shimmer state, exactly as designed.
    return (
      <div className="card">
        <div className="shimmer h-[150px]" />
        <div className="p-4 pb-[18px]">
          <div className="shimmer h-3.5 w-[120px] rounded-[7px]" />
          <div className="shimmer mt-2.5 h-6 w-[200px] rounded-lg" />
          <div className="shimmer mt-2.5 h-3.5 w-[260px] rounded-[7px]" />
          <div className="mt-3.5 text-[14px] font-bold text-flame">
            Finding something they&apos;ll like just as much…
          </div>
        </div>
      </div>
    );
  }

  const body = (
    <div className={`px-[18px] pb-[18px] pt-4 ${desktopRow ? "flex-1" : ""}`}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="stime">
          {stop.arrival_time} · {stop.label.toUpperCase()}
        </div>
        {desktopRow && onSwap && (
          <button className="swapbtn" onClick={onSwap} aria-label={`Swap ${stop.name}`}>
            ⇄
          </button>
        )}
      </div>
      <div className="text-vname font-semibold">{stop.name}</div>
      <div className="text-[14px] text-mutedbrown">
        {stop.area}
        {stop.what_to_do ? ` · ${stop.what_to_do}` : ""}
      </div>

      {stop.orders.length > 0 && (
        <div className="mt-3">
          {stop.orders.map((o, i) => (
            <div
              key={`${o.item}-${i}`}
              className={`order-line ${i === stop.orders.length - 1 ? "border-none" : ""}`}
            >
              <span>
                {o.item}
                {o.qty > 1 ? ` ×${o.qty}` : ""}
              </span>
              <b className="whitespace-nowrap font-bold text-ink">{ghs(o.price_ghs)}</b>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[15px]">
        <span className="text-mutedbrown">Est. for two</span>
        <b className="whitespace-nowrap text-[17px] text-lagoon">{ghs(stop.est_cost_for_two_ghs)}</b>
      </div>

      <div className="why mt-3">{stop.why_this_fits}</div>

      {(stop.reservation_required || stop.google_maps_url) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-mutedbrown">
          {stop.reservation_required && (
            <span className="rounded-md bg-sand px-2 py-0.5 font-semibold text-cocoa">
              Book ahead
            </span>
          )}
          {stop.google_maps_url && (
            <a
              href={stop.google_maps_url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-flame hover:text-flame-dark"
            >
              Open in Maps →
            </a>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`card transition-opacity ${dimmed ? "opacity-55" : ""} ${
        highlight ? "ring-2 ring-flame" : ""
      } ${desktopRow ? "md:flex" : ""}`}
    >
      <div className={`relative ${desktopRow ? "md:w-[220px] md:shrink-0" : ""}`}>
        <SmartImage
          src={stop.image_url}
          alt={stop.name}
          className={desktopRow ? "h-[150px] md:h-full md:min-h-full" : "h-[150px]"}
        />
        {!desktopRow && onSwap && (
          <div className="absolute right-3 top-3 z-[2]">
            <button className="swapbtn" onClick={onSwap} aria-label={`Swap ${stop.name}`}>
              ⇄
            </button>
          </div>
        )}
      </div>
      {body}
    </div>
  );
}
