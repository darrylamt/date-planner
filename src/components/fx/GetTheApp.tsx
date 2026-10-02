"use client";

import { useEffect, useState } from "react";
import fx from "./fx.module.css";
import { FlipText } from "./FlipText";
import { APP_STORE_URL } from "@/lib/links";

/*
 * What Duro plans, one turning into the next, each with the shape of the
 * outing it would hand back. Illustrations: no venue is named.
 */
const NEXT = [
  { word: "date", emoji: "💘", stops: ["🍽️ Dinner in Osu", "🍸 Cocktails nearby"], total: "GHS 640 for two" },
  { word: "birthday", emoji: "🎂", stops: ["🎳 Games first", "🍰 Dinner, then cake"], total: "GHS 1,100 for four" },
  { word: "anniversary", emoji: "💍", stops: ["💆 Couples massage", "🥂 Dinner by the sea"], total: "GHS 1,800 for two" },
  { word: "link-up", emoji: "🤙", stops: ["🍗 Grills and drinks", "🎤 Karaoke after"], total: "GHS 750 for five" },
  { word: "solo day", emoji: "🧘", stops: ["🏊 A pool day", "☕ Brunch after"], total: "GHS 350 for one" },
  { word: "family day", emoji: "👨‍👩‍👧", stops: ["🌳 Out in the open", "🍕 Lunch after"], total: "GHS 1,200 for six" },
];

/**
 * The way to the app. The word after "Plan your next" turns over through
 * what Duro plans, and a small plan for each rises under it. Apple's badge
 * is left exactly as Apple draws it; everything around it moves instead.
 *
 * Takes its colours from --c1 and --c2 on whatever it sits in; `ink` is the
 * text colour that reads on those two.
 */
export function GetTheApp({
  reduced,
  ink,
  eyebrow = "Duro! for iPhone",
  className = "",
  prices = true,
}: {
  reduced: boolean;
  ink: string;
  eyebrow?: string;
  className?: string;
  /**
   * The example totals. Off under a shared plan, where "GHS 640 for two"
   * beside somebody's own date reads as what their evening cost.
   */
  prices?: boolean;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((n) => (n + 1) % NEXT.length), 2600);
    return () => clearInterval(t);
  }, [reduced]);
  const now = NEXT[i];

  return (
    <div className={`${fx.appCard} rounded-[28px] border border-white/10 p-5 text-left md:p-7 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/55">{eyebrow}</p>
          <h2 className="mt-2 text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] md:text-[36px]">
            Plan your next
            <span className="sr-only"> date.</span>
            <span aria-hidden className="block">
              <FlipText name={`${now.word}.`} className={fx.rotor} accent="whole" />
            </span>
          </h2>
        </div>
        <span key={now.word} aria-hidden className={`${fx.heart} shrink-0 text-[44px] leading-none`}>
          {now.emoji}
        </span>
      </div>

      <p className="mt-3 max-w-[480px] text-[15px] text-white/70">
        {prices
          ? "Tell it your budget and what you are in the mood for. It picks the places, orders from real menus and adds up the whole outing, the ride there included."
          : "Tell it who it is for and what you are in the mood for. It picks the places, what to order and how to get between them."}
      </p>

      <div key={`plan-${now.word}`} aria-hidden className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-semibold sm:text-[14px]">
        {now.stops.map((stop, k) => (
          <span key={stop} className="flex items-center gap-2">
            {/* Not on a phone, where the chips wrap and an arrow would start a line. */}
            {k ? (
              <span className={`${fx.rise} hidden text-white/40 sm:inline`} style={{ animationDelay: `${80 + k * 160}ms` }}>
                →
              </span>
            ) : null}
            <span
              className={`${fx.rise} rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5`}
              style={{ animationDelay: `${120 + k * 160}ms` }}
            >
              {stop}
            </span>
          </span>
        ))}
        {prices ? (
          <span
            className={`${fx.rise} rounded-full px-3 py-1.5 font-bold`}
            style={{ animationDelay: "460ms", background: "linear-gradient(90deg, var(--c1), var(--c2))", color: ink }}
          >
            {now.total}
          </span>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* noopener without noreferrer, so App Store Connect can see where installs came from. */}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener"
          className="inline-block rounded-[9px] outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-store-badge.svg" alt="Download on the App Store" width={150} height={50} className="block h-[50px] w-auto" />
        </a>
        <span className="text-[13px] text-white/55">
          Free on iPhone. Search <b className="text-white/80">Duro!</b> on the App Store.
        </span>
      </div>
    </div>
  );
}
