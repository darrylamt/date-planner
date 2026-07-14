"use client";

import { useState } from "react";
import { SmartImage } from "./SmartImage";
import { ghs } from "@/lib/format";
import type { ItineraryOrder, ItineraryStop, MenuItem } from "@/lib/types";

const CATEGORY_ORDER = ["starter", "main", "dessert", "drink", "other"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  starter: "Starters",
  main: "Mains",
  dessert: "Desserts",
  drink: "Drinks",
  other: "Extras & activities",
};

/** Venue/stop card from the style tile (.stop) — mobile stacked, desktop side-by-side. */
export function StopCard({
  stop,
  onSwap,
  onOrdersChange,
  onReserve,
  reserving = false,
  swapping = false,
  dimmed = false,
  highlight = false,
  desktopRow = false,
}: {
  stop: ItineraryStop;
  onSwap?: () => void;
  /** When provided (and the stop is a venue), orders become editable via the menu. */
  onOrdersChange?: (orders: ItineraryOrder[]) => void;
  /** When provided (and the stop needs booking), shows the Reserve action. */
  onReserve?: () => void;
  reserving?: boolean;
  swapping?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  desktopRow?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState(false);

  const editable = Boolean(onOrdersChange) && stop.kind !== "event";

  async function toggleMenu() {
    const opening = !menuOpen;
    setMenuOpen(opening);
    if (opening && menu === null && !menuLoading) {
      setMenuLoading(true);
      setMenuError(false);
      try {
        const res = await fetch(`/api/venues/${stop.venue_id}`);
        if (!res.ok) throw new Error("menu fetch failed");
        const data = await res.json();
        setMenu((data.menu ?? []) as MenuItem[]);
      } catch {
        setMenuError(true);
      } finally {
        setMenuLoading(false);
      }
    }
  }

  function changeQty(index: number, delta: number) {
    if (!onOrdersChange) return;
    const next: ItineraryOrder[] = [];
    stop.orders.forEach((o, i) => {
      if (i !== index) {
        next.push(o);
        return;
      }
      const unit = o.qty > 0 ? o.price_ghs / o.qty : o.price_ghs;
      const qty = o.qty + delta;
      if (qty >= 1) next.push({ ...o, qty, price_ghs: Math.round(unit * qty) });
      // qty 0 → dropped
    });
    onOrdersChange(next);
  }

  function addItem(item: MenuItem) {
    if (!onOrdersChange) return;
    const unit = Number(item.price_ghs);
    const existing = stop.orders.findIndex((o) => o.item === item.name);
    if (existing >= 0) {
      changeQty(existing, 1);
      return;
    }
    onOrdersChange([...stop.orders, { item: item.name, qty: 1, price_ghs: unit }]);
  }

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

  const grouped = menu
    ? CATEGORY_ORDER.map((cat) => ({
        cat,
        items: menu.filter((m) => m.category === cat),
      })).filter((g) => g.items.length > 0)
    : [];

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
              <span className="flex items-center gap-2">
                {editable && (
                  <span className="flex items-center gap-1">
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-[13px] text-cocoa transition-colors hover:border-flame hover:text-flame"
                      onClick={() => changeQty(i, -1)}
                      aria-label={`Remove one ${o.item}`}
                    >
                      −
                    </button>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-[13px] text-cocoa transition-colors hover:border-flame hover:text-flame"
                      onClick={() => changeQty(i, 1)}
                      aria-label={`Add one ${o.item}`}
                    >
                      +
                    </button>
                  </span>
                )}
                <span>
                  {o.item}
                  {o.qty > 1 ? ` ×${o.qty}` : ""}
                </span>
              </span>
              <b className="whitespace-nowrap font-bold text-ink">{ghs(o.price_ghs)}</b>
            </div>
          ))}
        </div>
      )}

      {editable && (
        <button
          className="mt-2.5 text-[13px] font-bold text-flame hover:text-flame-dark"
          onClick={toggleMenu}
        >
          {menuOpen ? "Hide menu ↑" : "View menu — pick something else ↓"}
        </button>
      )}

      {editable && menuOpen && (
        <div className="mt-2.5 rounded-icon border border-line/70 bg-cream/40 px-3.5 py-3">
          {menuLoading && <div className="text-[14px] text-mutedbrown">Fetching the menu…</div>}
          {menuError && (
            <div className="text-[14px] text-mutedbrown">
              Couldn&apos;t load the menu right now — try again in a moment.
            </div>
          )}
          {menu && menu.length === 0 && (
            <div className="text-[14px] text-mutedbrown">No menu on file for this spot yet.</div>
          )}
          {grouped.map((g) => (
            <div key={g.cat} className="mb-2 last:mb-0">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-mutedbrown">
                {CATEGORY_LABEL[g.cat]}
              </div>
              {g.items.map((m) => {
                const inOrder = stop.orders.some((o) => o.item === m.name);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-[5px]">
                    <span className="text-[14px] text-cocoa">
                      {m.name}
                      {m.notes ? (
                        <span className="text-[12px] italic text-mutedbrown"> · {m.notes}</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className="font-mono text-[13px] text-amber">
                        {ghs(Number(m.price_ghs))}
                      </span>
                      <button
                        className={`rounded-md border px-2 py-0.5 text-[12px] font-bold transition-colors ${
                          inOrder
                            ? "border-flame bg-flame text-blush"
                            : "border-line text-cocoa hover:border-flame hover:text-flame"
                        }`}
                        onClick={() => addItem(m)}
                      >
                        {inOrder ? "+1" : "Add"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[15px]">
        <span className="text-mutedbrown">Est. for two</span>
        <b className="whitespace-nowrap text-[17px] text-amber">{ghs(stop.est_cost_for_two_ghs)}</b>
      </div>

      <div className="why mt-3">{stop.why_this_fits}</div>

      {(stop.reservation_required || stop.google_maps_url) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-mutedbrown">
          {stop.reservation_required && (
            <span className="rounded-md bg-sand px-2 py-0.5 font-semibold text-cocoa">
              Book ahead
            </span>
          )}
          {stop.reservation_required &&
            onReserve &&
            (stop.reservation_requested ? (
              <span className="rounded-md bg-whybg px-2 py-0.5 font-semibold text-amber">
                Reservation requested ✓
              </span>
            ) : (
              <button
                className="rounded-md bg-flame px-2.5 py-0.5 font-bold text-blush transition-colors hover:bg-flame-deep disabled:opacity-60"
                onClick={onReserve}
                disabled={reserving}
              >
                {reserving ? "Sending…" : "Reserve a table"}
              </button>
            ))}
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
