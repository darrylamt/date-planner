import Link from "next/link";
import type { CSSProperties } from "react";

/** 20 October to 1 November, on Accra's clock, which is UTC all year. */
export function isHalloween(at = new Date()): boolean {
  const m = at.getUTCMonth() + 1;
  const d = at.getUTCDate();
  return (m === 10 && d >= 20) || (m === 11 && d <= 1);
}

/** The wordmark's width over its height, from public/brand/duro-wordmark.png. */
const WORDMARK_RATIO = 2070 / 756;

/*
 * The marks are white PNGs used as masks over the text colour
 * (bg-current), so one file draws the logo in any colourway the sheet has
 * (scripts/brand-assets.ts makes them). The text colour and not a
 * background one, because the admin and the portal are light themes that
 * remap text-ink to their own dark ink: painted bg-ink, the logo there was
 * near-white on near-white.
 */
const masked = (file: string): CSSProperties => ({
  WebkitMaskImage: `url(${file})`,
  maskImage: `url(${file})`,
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
});

/** The D from the app icon, alone, in `className`'s text colour. */
export function DuroMark({ size, className = "text-ink", style }: { size: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width: size, height: size, ...masked("/brand/duro-mark.png"), ...style }}
    />
  );
}

/**
 * The Duro! wordmark: the D with its wave, and the o as a map pin.
 *
 * `size` is the old text wordmark's font size, kept so every caller stays
 * the size it was; the mark is drawn a little taller than that text, as its
 * wave hangs below the letters.
 *
 * At Halloween it is the season's logo instead, the witch-hat pumpkin and
 * all, on its own night. Pages built ahead of time revalidate hourly so it
 * arrives and leaves on its dates without a deploy.
 */
export function Logo({
  size = 20,
  dark = false,
  href = "/",
}: {
  size?: number;
  dark?: boolean;
  href?: string | null;
}) {
  const height = Math.round(size * 1.45);
  const mark = isHalloween() ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/halloween-logo.png"
      alt="Duro!"
      style={{ height: Math.round(size * 1.9), width: "auto" }}
      className="rounded-md"
    />
  ) : (
    <span
      role="img"
      aria-label="Duro!"
      className={`inline-block bg-current ${dark ? "text-lagoon-faint" : "text-ink"}`}
      style={{ height, width: Math.round(height * WORDMARK_RATIO), ...masked("/brand/duro-wordmark.png") }}
    />
  );
  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Duro! home">
      {mark}
    </Link>
  );
}
