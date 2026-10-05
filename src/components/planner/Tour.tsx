"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconArrow, IconCheck, IconImage, IconTicket, IconUser } from "./icons";

const SEEN_KEY = "duro.planner.tour";

/**
 * The welcome, on a planner's first visit and whenever they ask for it again.
 *
 * Four slides and no more: what Duro is, where their night ends up, how
 * quick it is to put one on, and the three things that decide whether it
 * gets picked. Seen is stored on the account rather than the browser, so a
 * planner who saw it on their laptop is not shown it again on their phone.
 */
export function Tour({ name, open: initiallyOpen }: { name: string; open: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const touch = useRef<number | null>(null);

  // A browser that already finished it, before the account knew.
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
      if (e.key === "Escape") void finish();
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

  async function finish(then?: string) {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* Fine. */
    }
    // Merged into the account's metadata; the page reads it next time.
    void createClient().auth.updateUser({ data: { planner_tour_done: true } });
    if (then) router.push(then);
    else if (window.location.search.includes("tour=1")) router.replace("/planner");
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
            <button type="button" className="rounded-full px-3 py-1.5 text-[14px] font-bold text-[var(--p-muted)] hover:text-[var(--p-ink)]" onClick={() => void finish()}>
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
              <button type="button" className="pl-btn w-full" onClick={() => void finish("/planner/nights/new")}>
                Put on my first night <IconArrow size={20} />
              </button>
              <button type="button" className="pl-btn-ghost w-full" onClick={() => void finish()}>
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
    body: "Duro plans whole evenings out for people in Accra and Kumasi: where to eat, where to go after, and how to get there. Your nights can be part of them.",
    art: () => (
      <div className="relative">
        <div className="absolute inset-0 -z-10 m-auto h-48 w-48 rounded-full bg-[var(--p-accent-soft)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascots/celebration.png" alt="" className="pl-float h-48 w-48 [image-rendering:pixelated]" />
      </div>
    ),
  },
  {
    title: () => "Your night, inside their plan",
    body: "When somebody plans an evening on your date, near your venue, in the mood you describe, we can build it around your night, with dinner before and a ride there.",
    art: (name) => (
      <div className="w-full max-w-[300px]">
        {[
          { label: "A TABLE", name: "Dinner nearby", time: "7:00pm", you: false },
          { label: "YOUR NIGHT", name, time: "9:00pm", you: true },
          { label: "DESSERT", name: "Something sweet", time: "11:30pm", you: false },
        ].map((s, n) => (
          <div key={s.label} className="pl-up" style={{ animationDelay: `${150 + n * 160}ms` }}>
            <div
              className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                s.you ? "scale-[1.04] bg-white shadow-[0_14px_30px_-14px_rgb(201_44_88/0.6)] ring-2 ring-[var(--p-accent)]" : "bg-white/70 ring-1 ring-[var(--p-line)]"
              }`}
            >
              <div>
                <div className={`text-[11px] font-bold tracking-[0.08em] ${s.you ? "text-[var(--p-accent)]" : "text-[var(--p-muted)]"}`}>{s.label}</div>
                <div className="text-[15px] font-bold">{s.name}</div>
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
    title: () => "Put a night on in a minute",
    body: "One question at a time: the name, the date, the place, the price, the poster. You see the card take shape as you go, and it goes live the moment you finish.",
    art: () => (
      <div className="flex w-full max-w-[300px] flex-col gap-2">
        {["Name", "Date and time", "Place", "Price at the door", "Poster"].map((x, n) => (
          <div
            key={x}
            className="pl-up flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 ring-1 ring-[var(--p-line)]"
            style={{ animationDelay: `${120 + n * 120}ms` }}
          >
            <span className="pl-pop grid h-7 w-7 place-items-center rounded-full bg-[var(--p-ok)] text-white" style={{ animationDelay: `${420 + n * 120}ms` }}>
              <IconCheck size={15} />
            </span>
            <span className="text-[15px] font-semibold">{x}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: () => "What gets a night picked",
    body: "Three things make the difference. You can add all of them now or later, and we'll remind you on your home screen.",
    art: () => (
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        {[
          { icon: <IconTicket size={22} />, t: "A price at the door", s: "Even if it's free. No price, and budget plans skip it." },
          { icon: <IconImage size={22} />, t: "A poster", s: "It's the first thing people see on the card." },
          { icon: <IconUser size={22} />, t: "Your logo", s: "Beside \"Hosted by\", so people learn your name." },
        ].map((x, n) => (
          <div key={x.t} className="pl-up flex gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-[var(--p-line)]" style={{ animationDelay: `${120 + n * 150}ms` }}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--p-accent-soft)] text-[var(--p-accent)]">{x.icon}</span>
            <span>
              <span className="block text-[15.5px] font-bold">{x.t}</span>
              <span className="block text-[13.5px] text-[var(--p-muted)]">{x.s}</span>
            </span>
          </div>
        ))}
      </div>
    ),
  },
];
