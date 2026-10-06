"use client";

import { useRef, useState } from "react";

/**
 * A picture that may be a poster: cropped to fill its frame when it is about
 * the frame's shape, and shown whole over a blurred copy of itself when it is
 * much taller, the way the app now shows it on an event's card.
 */
export function WholeImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [whole, setWhole] = useState(false);

  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      {whole ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-75" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`pl-fade relative h-full w-full ${whole ? "object-contain" : "object-cover"}`}
        onLoad={(e) => {
          const img = e.currentTarget;
          const frame = box.current?.getBoundingClientRect();
          if (!img.naturalWidth || !img.naturalHeight || !frame?.width || !frame.height) return;
          const ratio = img.naturalWidth / img.naturalHeight;
          setWhole(ratio < 1.1 || ratio < (frame.width / frame.height) * 0.6);
        }}
      />
    </div>
  );
}
