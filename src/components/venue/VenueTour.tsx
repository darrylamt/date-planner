"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconArrow, IconCheck, IconPhone } from "@/components/planner/icons";

const SEEN_KEY = "duro.venue.tour";

/**
 * The welcome, on a venue's first visit and whenever they ask for it again
 * (Help, or ?tour=1). Four slides: what Duro is, where the venue ends up,
 * why prices matter most, and how bookings arrive. Seen is stored on the
 * account, so a manager who saw it on a laptop is not shown it on a phone.
 */
export function VenueTour({ name, open: initiallyOpen, menuHref }: { name: string; open: boolean; menuHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const touch = useRef<number | null>(null);

  useEffect(() => {
    if (!initiallyOpen) return;
    try {
      if (localStorage.getItem(SEEN_KEY) === "1" && !window.location.search.includes("tour=1")) setOpen(false);
    } catch {
      /* Fine. */
    }
  }, [initiallyOpen]);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i]);

  function move(by: number) {
    const to = Math.max(0, Math.min(SLIDES.length - 1, i + by));
    if (to === i) return;
    setDir(by > 0 ? "fwd" : "back");
    setI(to);
  }

  function finish(then?: string) {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* Fine. */
    }
    void createClient().auth.updateUser({ data: { venue_tour_done: true } });
    if (then) router.push(then);
    else if (window.location.search.includes("tour=1")) {
      const params = new URLSearchParams(window.location.search);
      params.delete("tour");
      router.replace(`/venue${params.toString() ? `?${params}` : ""}`);
    }
  }

  if (!open) return null;
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[rgb(28_18_22/0.55)] backdrop-blur-sm md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Duro"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) move(dx < 0 ? 1 : -1);
      }}
    >
      <div className="pl-fade relative flex w-full flex-col overflow-hidden bg-[var(--p-bg)] md:max-w-[480px] md:rounded-[32px] md:shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex gap-1.5" aria-label={`Slide ${i + 1} of ${SLIDES.length}`}>
            {SLIDES.map((_, n) => (
              <span
                key={n}
                className="h-2 rounded-full transition-all duration-300"
                style={{ width: n === i ? 26 : 8, background: n <= i ? "var(--p-accent)" : "var(--p-line)" }}
              />
            ))}
          </div>
          {!last ? (
            <button type="button" className="rounded-full px-3 py-1.5 text-[14px] font-bold text-[var(--p-muted)] hover:text-[var(--p-ink)]" onClick={() => finish()}>
              Skip
            </button>
          ) : null}
        </div>

        <div key={i} className={`flex flex-1 flex-col px-6 pb-4 pt-4 ${dir === "fwd" ? "pl-in-right" : "pl-in-left"}`}>
          <div className="grid min-h-[260px] flex-1 place-items-center">{slide.art(name)}</div>
          <h2 className="mt-4 text-[27px] font-bold leading-tight">{slide.title(name)}</h2>
          <p className="mt-2 text-[16px] leading-relaxed text-[var(--p-ink-2)]">{slide.body}</p>
        </div>

        <div className="pl-safe-bottom flex flex-col gap-2.5 px-6 pb-6 pt-2">
          {last ? (
            <>
              <button type="button" className="pl-btn w-full" onClick={() => finish(menuHref)}>
                Check my menu <IconArrow size={20} />
              </button>
              <button type="button" className="pl-btn-ghost w-full" onClick={() => finish()}>
                Look around first
              </button>
            </>
          ) : (
            <div className="flex gap-3">
              {i > 0 ? (
                <button type="button" className="pl-btn-ghost" onClick={() => move(-1)}>
                  Back
                </button>
              ) : null}
              <button type="button" className="pl-btn flex-1" onClick={() => move(1)}>
                Next <IconArrow size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SLIDES: { title: (name: string) => string; body: string; art: (name: string) => JSX.Element }[] = [
  {
    title: (name) => `Welcome, ${name}`,
    body: "Duro plans whole evenings out for people in Accra and Kumasi: where to eat, where to go after, and how to get there. This is where you keep your part of it right.",
    art: () => (
      <div className="relative">
        <div className="absolute inset-0 -z-10 m-auto h-48 w-48 rounded-full bg-[var(--p-accent-soft)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascots/scene_table.png" alt="" className="pl-float h-48 w-48 [image-rendering:pixelated]" />
      </div>
    ),
  },
  {
    title: () => "Your place, inside their plan",
    body: "When somebody plans a date, a birthday or a night out near you, Duro can make you a stop in it, with what to order and what it will cost.",
    art: (name) => (
      <div className="w-full max-w-[300px]">
        {[
          { label: "DINNER", name, time: "7:00pm", you: true },
          { label: "A DRINK AFTER", name: "Somewhere nearby", time: "9:00pm", you: false },
          { label: "THE RIDE HOME", name: "Bolt, about GHS 45", time: "11:00pm", you: false },
        ].map((s, n) => (
          <div key={s.label} className="pl-up" style={{ animationDelay: `${150 + n * 160}ms` }}>
            <div
              className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                s.you ? "scale-[1.04] bg-white shadow-[0_14px_30px_-14px_rgb(201_44_88/0.6)] ring-2 ring-[var(--p-accent)]" : "bg-white/70 ring-1 ring-[var(--p-line)]"
              }`}
            >
              <div className="min-w-0">
                <div className={`text-[11px] font-bold tracking-[0.08em] ${s.you ? "text-[var(--p-accent)]" : "text-[var(--p-muted)]"}`}>{s.label}</div>
                <div className="truncate text-[15px] font-bold">{s.name}</div>
              </div>
              <div className="text-[13px] tabular-nums text-[var(--p-muted)]">{s.time}</div>
            </div>
            {n < 2 ? <div className="mx-auto h-4 w-0.5 bg-[var(--p-line)]" /> : null}
          </div>
        ))}
      </div>
    ),
  },
  {
    title: () => "Prices are what get you picked",
    body: "Every plan has a budget, and Duro orders from your real menu to keep to it. A place with no prices is left out, so keeping your menu current is the most useful thing you can do here.",
    art: () => (
      <div className="w-full max-w-[290px] rounded-[22px] bg-white p-4 ring-1 ring-[var(--p-line)]">
        <div className="text-[12px] font-bold tracking-[0.08em] text-[var(--p-muted)]">YOUR MENU</div>
        {[
          ["Jollof with chicken", "85"],
          ["Grilled tilapia & banku", "140"],
          ["Fresh sobolo", "25"],
          ["Chocolate lava cake", "60"],
        ].map(([dish, price], n) => (
          <div key={dish} className="pl-up flex items-center justify-between border-b border-[var(--p-line)] py-2.5 last:border-0" style={{ animationDelay: `${150 + n * 130}ms` }}>
            <span className="text-[14.5px] font-semibold">{dish}</span>
            <span className="pl-pop rounded-full bg-[var(--p-ok-soft)] px-2.5 py-0.5 text-[13px] font-bold tabular-nums text-[var(--p-ok)]" style={{ animationDelay: `${400 + n * 130}ms` }}>
              GHS {price}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: () => "Bookings come straight to you",
    body: "People ask for a table from their plan, on WhatsApp, by phone or on your booking page, however you take them. Requests sent through Duro show on your Home tab.",
    art: () => (
      <div className="flex w-full max-w-[300px] flex-col gap-3">
        <div className="pl-up rounded-[22px] bg-white p-4 shadow-[0_14px_30px_-16px_rgb(28_18_22/0.4)] ring-1 ring-[var(--p-line)]" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[var(--p-accent)] px-2.5 py-0.5 text-[12px] font-bold text-white">New</span>
            <span className="text-[13px] text-[var(--p-muted)]">Sat · 7:30pm</span>
          </div>
          <div className="mt-2 text-[17px] font-bold">Ama · table for 2</div>
          <div className="mt-3 flex gap-2">
            <span className="pl-pop flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--p-ok)] py-2 text-[14px] font-bold text-white" style={{ animationDelay: "600ms" }}>
              <IconCheck size={16} /> Confirmed
            </span>
          </div>
        </div>
        <div className="pl-up flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-[var(--p-line)]" style={{ animationDelay: "320ms" }}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--p-ok-soft)] text-[var(--p-ok)]">
            <IconPhone size={18} />
          </span>
          <span className="text-[14px] font-semibold">Or they ring or WhatsApp you directly</span>
        </div>
      </div>
    ),
  },
];
