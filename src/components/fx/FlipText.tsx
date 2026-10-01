"use client";

import { useEffect, useRef, useState } from "react";
import fx from "./fx.module.css";

/**
 * Text re-lettered whenever it changes: the old letters fall away while the
 * new ones flip up one by one. The last third takes the accent, the way
 * "Du" and "ro!" are split in the logo, with any closing "!" riding along
 * rather than counting as a letter; `accent` can give it all or none.
 * `delay` holds the first flip back, for text that arrives after something.
 */
export function FlipText({
  name,
  className = fx.word,
  accent = "tail",
  delay = 140,
}: {
  name: string;
  className?: string;
  accent?: "tail" | "whole" | "none";
  delay?: number;
}) {
  const [layers, setLayers] = useState([{ key: 0, text: name, leaving: false }]);
  const next = useRef(1);

  useEffect(() => {
    setLayers((cur) => {
      if (cur[cur.length - 1]?.text === name) return cur;
      const key = next.current++;
      return [...cur.filter((l) => !l.leaving).map((l) => ({ ...l, leaving: true })), { key, text: name, leaving: false }];
    });
    const t = setTimeout(() => setLayers((cur) => cur.filter((l) => !l.leaving)), 700);
    return () => clearTimeout(t);
  }, [name]);

  return (
    <span className={className} aria-label={name} role="img">
      {layers.map((l) => {
        const letters = [...l.text];
        const core = letters.length - (l.text.match(/[!?.]+$/)?.[0].length ?? 0);
        const split = accent === "whole" ? 0 : accent === "none" ? Infinity : core - Math.max(2, Math.ceil(core / 3));
        return (
          <span key={l.key} className={fx.wordLayer} aria-hidden>
            {letters.map((ch, i) => (
              <span
                key={i}
                className={`${fx.letter} ${l.leaving ? fx.letterOut : fx.letterIn} ${i >= split ? fx.accent : ""}`}
                style={{ animationDelay: `${l.leaving ? i * 22 : delay + i * 48}ms` }}
              >
                {ch}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}
