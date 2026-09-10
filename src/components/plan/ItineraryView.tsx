"use client";

import { useState } from "react";
import { BackArrow } from "@/components/BackArrow";
import { BudgetBar } from "@/components/BudgetBar";
import { HopConnector } from "@/components/HopConnector";
import { StopCard } from "@/components/StopCard";
import { Toast } from "@/components/Toast";
import { ghs, longDate } from "@/lib/format";
import { downloadIcs } from "@/lib/ics";
import type { Itinerary, ItineraryOrder, PlanInputs } from "@/lib/types";

/**
 * Itinerary result — mobile timeline at 390px and the two-column desktop
 * layout from the design (stops left, sticky budget rail right).
 */
export function ItineraryView({
  inputs,
  itinerary,
  onItineraryChange,
  onEdit,
  shareSlug,
  onSave,
  saving,
  readOnlyDemo = false,
}: {
  inputs: PlanInputs;
  itinerary: Itinerary;
  onItineraryChange: (it: Itinerary) => void;
  onEdit: () => void;
  shareSlug: string | null;
  onSave: () => Promise<string | null>;
  saving: boolean;
  readOnlyDemo?: boolean;
}) {
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [reservingIndex, setReservingIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  async function handleSwap(index: number) {
    if (swappingIndex !== null) return;
    setSwappingIndex(index);
    setHighlightIndex(null);
    try {
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, itinerary, stopIndex: index }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        onItineraryChange(data.itinerary);
        setHighlightIndex(index);
        const buffer = inputs.budget - data.itinerary.est_total_ghs;
        showToast(`Swapped — still ${ghs(buffer)} under budget`);
      } else {
        showToast(data.message ?? "Couldn't find a good swap.");
      }
    } catch {
      showToast("Couldn't find a good swap.");
    } finally {
      setSwappingIndex(null);
    }
  }

  /** Menu edits: replace a stop's orders and recompute food + overall totals. */
  function handleOrdersChange(index: number, orders: ItineraryOrder[]) {
    const stopCost = Math.round(orders.reduce((sum, o) => sum + Number(o.price_ghs), 0));
    const stops = itinerary.stops.map((s, i) =>
      i === index ? { ...s, orders, est_cost_ghs: stopCost } : s
    );
    const food = Math.round(stops.reduce((sum, s) => sum + Number(s.est_cost_ghs), 0));
    const est = Math.round(food + Number(itinerary.transport_total_ghs));
    onItineraryChange({ ...itinerary, stops, food_total_ghs: food, est_total_ghs: est });
    if (est > inputs.budget) {
      showToast(`Heads up — now ${ghs(est - inputs.budget)} over budget`);
    }
  }

  /**
   * Reserve on the user's behalf: log the request (our system of record),
   * then hand off to the venue's WhatsApp with a pre-written message.
   */
  async function handleReserve(index: number) {
    if (reservingIndex !== null) return;
    const stop = itinerary.stops[index];
    setReservingIndex(index);
    // Open the tab synchronously so popup blockers treat it as user-initiated.
    const waWindow = window.open("", "_blank");
    try {
      const [venueRes] = await Promise.all([
        fetch(`/api/venues/${stop.venue_id}`),
        fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            venueId: stop.venue_id,
            venueName: stop.name,
            planSlug: shareSlug,
            partySize: 2,
            date: inputs.date,
            arrivalTime: stop.arrival_time,
            guestName: inputs.partner.name,
          }),
        }),
      ]);

      const phone: string | null = venueRes.ok
        ? ((await venueRes.json())?.venue?.phone ?? null)
        : null;

      if (phone && waWindow) {
        const msg =
          `Hello ${stop.name}! I'd like to reserve a table for two on ` +
          `${longDate(inputs.date)} at ${stop.arrival_time}. ` +
          `Please confirm availability. — sent via aduro`;
        waWindow.location.href = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
        showToast("Request sent — the venue will confirm on WhatsApp");
      } else {
        waWindow?.close();
        showToast("Request logged — this venue has no WhatsApp number yet, we'll follow up");
      }

      const stops = itinerary.stops.map((s, i) =>
        i === index ? { ...s, reservation_requested: true } : s
      );
      onItineraryChange({ ...itinerary, stops });
    } catch {
      waWindow?.close();
      showToast("Couldn't send the reservation — try again in a moment.");
    } finally {
      setReservingIndex(null);
    }
  }

  async function handleShare() {
    let slug = shareSlug;
    if (!slug) slug = await onSave();
    if (!slug) return;
    const url = `${window.location.origin}/p/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied — send it to anyone");
    } catch {
      showToast(url);
    }
  }

  /** Added feature: WhatsApp share — the way plans actually get sent in Ghana. */
  async function handleWhatsApp() {
    let slug = shareSlug;
    if (!slug) slug = await onSave();
    if (!slug) return;
    const url = `${window.location.origin}/p/${slug}`;
    const text = encodeURIComponent(`Our plan for ${longDate(inputs.date)} 💛 ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  const stops = itinerary.stops;

  return (
    <main className="min-h-screen bg-parchment">
      <div className="mx-auto w-full max-w-[560px] md:max-w-[1080px]">
        {/* Sticky header + budget bar (mobile); desktop title row */}
        <div className="sticky top-0 z-10 bg-parchment px-5 pb-3 pt-[18px] md:static">
          <div className="mb-3 flex items-center justify-between">
            <button className="backbtn" onClick={onEdit} aria-label="Back to inputs">
              <BackArrow />
            </button>
            <div className="font-display text-[16px] font-bold md:text-[24px]">
              {longDate(inputs.date)}
            </div>
            <button
              className="text-[14px] font-semibold text-flame hover:text-flame-dark"
              onClick={onEdit}
            >
              Edit
            </button>
          </div>
          <div className="md:hidden">
            <BudgetBar
              estimated={itinerary.est_total_ghs}
              budget={inputs.budget}
              food={itinerary.food_total_ghs}
              transport={itinerary.transport_total_ghs}
            />
          </div>
        </div>

        <div className="md:flex md:items-start md:gap-10 md:px-5 md:pb-11">
          {/* Timeline */}
          <div className="px-5 pt-4 md:flex-1 md:px-0 md:pt-0">
            <div className="hidden md:mb-1 md:block">
              <div className="font-display text-[28px] font-bold">{itinerary.title}</div>
              <div className="mb-6 mt-1 text-[15px] text-mutedbrown">
                {itinerary.summary_route} · from {stops[0]?.arrival_time}
              </div>
            </div>

            {itinerary.budget_note && (
              <div className="why mb-4 border border-dashed border-amber-deep/50 bg-avoidbg not-italic text-staletext">
                {itinerary.budget_note}
              </div>
            )}

            {stops.map((stop, i) => (
              <div key={`${stop.venue_id}-${i}`}>
                <StopCard
                  stop={stop}
                  swapping={swappingIndex === i}
                  dimmed={swappingIndex !== null && swappingIndex !== i}
                  highlight={highlightIndex === i}
                  onSwap={readOnlyDemo ? undefined : () => handleSwap(i)}
                  onOrdersChange={
                    readOnlyDemo ? undefined : (orders) => handleOrdersChange(i, orders)
                  }
                  onReserve={readOnlyDemo ? undefined : () => handleReserve(i)}
                  reserving={reservingIndex === i}
                  desktopRow
                />
                {i < stops.length - 1 && (
                  <HopConnector
                    hop={itinerary.hops[i]}
                    recalculating={swappingIndex !== null}
                  />
                )}
              </div>
            ))}

            <p className="mt-4 text-center text-caption text-mutedbrown md:text-left">
              Prices are estimates gathered from venues and may change. Confirm big-ticket items
              with the venue.
            </p>
          </div>

          {/* Desktop rail / mobile footer actions */}
          <div className="flex flex-col gap-3.5 px-5 pb-8 pt-5 md:sticky md:top-6 md:w-[340px] md:px-0 md:pt-0">
            <div className="hidden md:block">
              <div className="bbar px-[22px] py-5">
                <div className="text-[13px] font-bold tracking-[0.06em] text-lagoon-soft">
                  BUDGET
                </div>
                <div className="my-1.5 font-display text-[30px] font-bold">
                  {ghs(itinerary.est_total_ghs)}{" "}
                  <span className="text-[15px] font-medium text-lagoon-soft">
                    of {inputs.budget}
                  </span>
                </div>
                <div className="bfill">
                  <i
                    className="bfill-i"
                    style={{
                      width: `${Math.min(100, Math.round((itinerary.est_total_ghs / inputs.budget) * 100))}%`,
                    }}
                  />
                </div>
                <div className="mt-2.5 flex justify-between text-[13px] text-lagoon-soft">
                  <span>
                    Food {ghs(itinerary.food_total_ghs)} · Transport{" "}
                    {ghs(itinerary.transport_total_ghs)}
                  </span>
                  <span className="font-bold text-amber">
                    {ghs(Math.max(0, inputs.budget - itinerary.est_total_ghs))} buffer
                  </span>
                </div>
              </div>

              {itinerary.personal_summary && (
                <div className="card mt-3.5 px-5 py-[18px]">
                  <div className="text-caption font-bold uppercase tracking-[0.08em] text-mutedbrown">
                    Built around {inputs.partner.name || "them"}
                  </div>
                  <div className="mt-2 text-[15px] leading-relaxed text-cocoa">
                    {itinerary.personal_summary}
                  </div>
                </div>
              )}
            </div>

            {!readOnlyDemo && (
              <>
                <button className="btn" onClick={onSave} disabled={saving}>
                  {saving ? "Saving…" : shareSlug ? "Saved ✓" : "Save plan"}
                </button>
                <button className="btn2" onClick={handleShare}>
                  Share plan
                </button>
                {/* Added features: WhatsApp + calendar, in the same visual language */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button className="btn2 btnsm" onClick={handleWhatsApp}>
                    WhatsApp
                  </button>
                  <button className="btn2 btnsm" onClick={() => downloadIcs(inputs, itinerary)}>
                    Add to calendar
                  </button>
                </div>
              </>
            )}
            {readOnlyDemo && (
              <a href="/plan/new" className="btn">
                Plan your own
              </a>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </main>
  );
}
