"use client";

import { useMemo, type CSSProperties } from "react";

const COLOURS = ["#c92c58", "#e5b04e", "#0f766e", "#55203a", "#f2a2c0"];

/** A burst from the middle of the screen, once, when a night goes on. */
export function Confetti({ pieces = 42 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.4;
        const reach = 140 + Math.random() * 160;
        return {
          left: `${48 + Math.random() * 4}%`,
          background: COLOURS[i % COLOURS.length],
          animationDelay: `${Math.random() * 120}ms`,
          "--dx": `${Math.cos(angle) * reach}px`,
          "--dy": `${Math.sin(angle) * reach + 120}px`,
          "--rot": `${Math.round(Math.random() * 720 - 360)}deg`,
        } as CSSProperties;
      }),
    [pieces]
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 h-0">
      {bits.map((style, i) => (
        <span key={i} className="pl-confetti-bit" style={style} />
      ))}
    </div>
  );
}
