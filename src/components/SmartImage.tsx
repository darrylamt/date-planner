"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/*
 * Hosts next.config.mjs lets the image service resize. A picture from anywhere
 * else (a poster link pasted by a planner) is shown as it is rather than
 * through the service, which refuses unlisted hosts with a broken image.
 */
const RESIZABLE = /(^|\.)supabase\.co$|^images\.unsplash\.com$|^res\.cloudinary\.com$/i;
const resizable = (src: string) => {
  try {
    return RESIZABLE.test(new URL(src).hostname);
  } catch {
    return true;
  }
};

/**
 * Photo with the design's woven placeholder as a graceful fallback.
 * The design used a striped ".ph" block for missing photos; we render real
 * photography (per the "more pictures, lively" brief) and fall back to the
 * same woven pattern when an image is missing or fails to load.
 *
 * `fit="auto"` is for pictures that may be posters. A picture much taller
 * than its frame is shown whole over a blurred copy of itself, rather than
 * cropped to its middle, where a poster rarely prints its date. `zoomable`
 * opens it full size on a tap.
 */
export function SmartImage({
  src,
  alt,
  className = "",
  overlay = true,
  sizes = "(max-width: 768px) 100vw, 640px",
  priority = false,
  fit = "cover",
  zoomable = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  overlay?: boolean;
  sizes?: string;
  priority?: boolean;
  fit?: "cover" | "auto";
  zoomable?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const [whole, setWhole] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const showFallback = !src || errored;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const canZoom = zoomable && !showFallback;

  return (
    <>
      <div
        ref={box}
        className={`relative overflow-hidden ${className} ${canZoom ? "cursor-zoom-in" : ""}`}
        onClick={canZoom ? () => setOpen(true) : undefined}
        role={canZoom ? "button" : undefined}
        tabIndex={canZoom ? 0 : undefined}
        aria-label={canZoom ? `${alt}, open full size` : undefined}
        onKeyDown={canZoom ? (e) => (e.key === "Enter" || e.key === " ") && setOpen(true) : undefined}
      >
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
          <>
            {whole ? (
              <Image src={src} alt="" aria-hidden fill sizes={sizes} unoptimized={!resizable(src)} className="scale-110 object-cover blur-2xl brightness-75" />
            ) : null}
            <Image
              src={src}
              alt={alt}
              fill
              sizes={sizes}
              priority={priority}
              unoptimized={!resizable(src)}
              className={whole ? "object-contain" : "object-cover"}
              onError={() => setErrored(true)}
              onLoad={(e) => {
                if (fit !== "auto") return;
                const img = e.currentTarget;
                const frame = box.current?.getBoundingClientRect();
                if (!img.naturalWidth || !img.naturalHeight || !frame?.width || !frame.height) return;
                // Square or portrait, or far narrower than the frame: cropping would lose the top and bottom.
                const ratio = img.naturalWidth / img.naturalHeight;
                if (ratio < 1.1 || ratio < (frame.width / frame.height) * 0.6) setWhole(true);
              }}
            />
          </>
        )}
        {overlay && !whole && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(226,61,109,0) 55%, rgba(26,13,20,0.45))",
            }}
          />
        )}
        {canZoom && whole ? (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white">
            See it all
          </span>
        ) : null}
      </div>

      {open && src ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-fadeup"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[92vh] max-w-full rounded-lg object-contain" />
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-[20px] text-white"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
