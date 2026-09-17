"use client";

import { useState } from "react";
import { SmartImage } from "./SmartImage";
import { ghs, instagramUrl, time12 } from "@/lib/format";
import type { ItineraryOrder, ItineraryStop, MenuItem } from "@/lib/types";

/*
 * "activity" is its own category, not a kind of "other".
 *
 * Migration 0019 split it out so a go-kart, a game of bowling and twelve
 * minutes of laser tag stopped being priced like a course. Both menu drawers
 * kept the old five-category list, so the 56 rows that moved had nowhere to
 * render: an arcade's entire price list was invisible, and its label here
 * still promised activities that were being filtered out one line below.
 */
const CATEGORY_ORDER = ["starter", "main", "dessert", "drink", "activity", "other"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  starter: "Starters",
  main: "Mains",
  dessert: "Desserts",
  drink: "Drinks",
  activity: "Things to do",
  other: "Extras",
};

/** Venue/stop card from the style tile (.stop), mobile stacked, desktop side-by-side. */
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
  /*
   * Typed filter over the drawer. Casa1715 lists 311 items and The Honeysuckle
   * 182, so "swap the rice for something else" meant scrolling a price list on
   * a phone until you gave up. The whole menu is already in memory by the time
   * this renders, so the search is local and instant, and no request is made
   * for a keystroke.
   */
  const [menuQuery, setMenuQuery] = useState("");
  /* Which picture the gallery is on. Clamped where it is read rather than
     reset on change, because a swap can shorten the list under it and page 3
     of a one-image gallery is a blank card with no way back. */
  const [shown, setShown] = useState(0);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState(false);

  const editable = Boolean(onOrdersChange) && stop.kind !== "event";

  async function toggleMenu() {
    const opening = !menuOpen;
    if (!opening) setMenuQuery("");
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

  // Name and notes both, because "vegetarian" and "serves two" live in notes
  // and are exactly the sort of thing somebody types when changing an order.
  const needle = menuQuery.trim().toLowerCase();
  const matching = menu
    ? needle
      ? menu.filter(
          (m) =>
            m.name.toLowerCase().includes(needle) ||
            (m.notes ?? "").toLowerCase().includes(needle)
        )
      : menu
    : null;

  const grouped = matching
    ? CATEGORY_ORDER.map((cat) => ({
        cat,
        items: matching.filter((m) => m.category === cat),
      })).filter((g) => g.items.length > 0)
    : [];

  // Short menus are quicker to read than to search, so the box only appears
  // where it earns its space.
  const searchable = (menu?.length ?? 0) > 8;

  /*
   * Falls back to the single hero for a plan saved before galleries existed,
   * which is every plan made until now: those carry image_url and nothing
   * else, and must still show their picture.
   */
  const pictures = stop.images?.length
    ? stop.images
    : stop.image_url
      ? [stop.image_url]
      : [];
  const at = Math.min(shown, Math.max(0, pictures.length - 1));

  /* Handles are stored as "@name" and occasionally as a pasted profile URL,
     so the link is derived rather than concatenated, and a handle that does
     not parse gives null and greys the mark out. */
  const instagram = instagramUrl(stop.instagram_handle);

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

      {/*
        Why this stop is here at all. The label above is already the event's
        name, but a name on its own reads like any other heading; this says
        plainly that it is happening on this date and not every night.
      */}
      {stop.event && (
        <div className="mt-1 text-[13px] font-semibold text-flame">
          On this date only
          {stop.event.start_time ? ` · starts ${time12(stop.event.start_time)}` : ""}
        </div>
      )}

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
          {menuOpen ? "Hide menu ↑" : "View menu, pick something else ↓"}
        </button>
      )}

      {editable && menuOpen && (
        <div className="mt-2.5 rounded-icon border border-line/70 bg-cream/40 px-3.5 py-3">
          {menuLoading && <div className="text-[14px] text-mutedbrown">Fetching the menu…</div>}
          {menuError && (
            <div className="text-[14px] text-mutedbrown">
              Couldn&apos;t load the menu right now, try again in a moment.
            </div>
          )}
          {menu && menu.length === 0 && (
            <div className="text-[14px] text-mutedbrown">No menu on file for this spot yet.</div>
          )}
          {searchable && (
            <div className="mb-2.5 flex items-center gap-2">
              <input
                type="search"
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
                placeholder={`Search ${menu!.length} items…`}
                aria-label={`Search the menu at ${stop.name}`}
                className="w-full rounded-md border border-line bg-blush px-2.5 py-1.5 text-[14px] text-cocoa placeholder:text-mutedbrown focus:border-flame focus:outline-none"
              />
              {needle && (
                <button
                  className="shrink-0 text-[13px] text-mutedbrown hover:text-flame"
                  onClick={() => setMenuQuery("")}
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {menu && menu.length > 0 && matching && matching.length === 0 && (
            <div className="text-[14px] text-mutedbrown">
              Nothing on this menu matches &ldquo;{menuQuery.trim()}&rdquo;.
            </div>
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
        <b className="whitespace-nowrap text-[17px] text-amber">{ghs(stop.est_cost_ghs)}</b>
      </div>

      <div className="why mt-3">{stop.why_this_fits}</div>

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

          {/*
            Greyed rather than hidden when there is no handle on file. Only
            twenty-nine of a hundred and eighty-five venues have one, so hiding
            it would say nothing about the gap and would make the row a
            different shape on almost every card.
          */}
          {instagram ? (
            <a
              href={instagram}
              target="_blank"
              rel="noreferrer"
              aria-label={`${stop.name} on Instagram`}
              title={`${stop.name} on Instagram`}
              className="text-flame transition-colors hover:text-flame-dark"
            >
              <InstagramMark />
            </a>
          ) : (
            <span
              aria-label="No Instagram recorded for this venue"
              title="No Instagram recorded for this venue"
              className="cursor-default text-line"
            >
              <InstagramMark />
            </span>
          )}
        </div>
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
          src={pictures[at] ?? null}
          alt={stop.name}
          className={desktopRow ? "h-[150px] md:h-full md:min-h-full" : "h-[150px]"}
        />

        {/*
          Only when there is somewhere to go. One picture with a pair of dead
          arrows on it reads as a gallery that is broken rather than as a
          photograph.
        */}
        {pictures.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous picture"
              className="absolute left-2 top-1/2 z-[2] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-[15px] font-bold text-white transition-opacity hover:bg-black/60 disabled:opacity-0"
              disabled={at === 0}
              onClick={() => setShown(Math.max(0, at - 1))}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next picture"
              className="absolute right-2 top-1/2 z-[2] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-[15px] font-bold text-white transition-opacity hover:bg-black/60 disabled:opacity-0"
              disabled={at === pictures.length - 1}
              onClick={() => setShown(Math.min(pictures.length - 1, at + 1))}
            >
              ›
            </button>
            <div className="absolute bottom-2 left-0 right-0 z-[2] flex justify-center gap-1.5">
              {pictures.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full bg-white transition-all ${
                    i === at ? "w-4 opacity-95" : "w-1.5 opacity-50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
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

/**
 * The Instagram mark.
 *
 * Inline rather than an icon font or an image, so it takes currentColor and
 * greys out with the element around it, which is the whole point of showing it
 * when there is no handle to open.
 */
function InstagramMark() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
