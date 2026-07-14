"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Photo with the design's woven placeholder as a graceful fallback.
 * The design used a striped ".ph" block for missing photos; we render real
 * photography (per the "more pictures, lively" brief) and fall back to the
 * same woven pattern when an image is missing or fails to load.
 */
export function SmartImage({
  src,
  alt,
  className = "",
  overlay = true,
  sizes = "(max-width: 768px) 100vw, 640px",
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  overlay?: boolean;
  sizes?: string;
  priority?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {showFallback ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(135deg, #331A26 0 14px, #2A1420 14px 28px)",
          }}
          aria-label={alt}
        />
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      )}
      {overlay && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(226,61,109,0) 55%, rgba(26,13,20,0.45))",
          }}
        />
      )}
    </div>
  );
}
