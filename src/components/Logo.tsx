import Link from "next/link";

/** Wordmark from the design: adu<b>ro</b>. */
export function Logo({
  size = 20,
  dark = false,
  href = "/",
}: {
  size?: number;
  dark?: boolean;
  href?: string | null;
}) {
  const mark = (
    <span
      className={`font-display font-bold tracking-[-0.01em] ${dark ? "text-lagoon-faint" : "text-ink"}`}
      style={{ fontSize: size }}
    >
      adu
      <span className={dark ? "text-amber" : "text-flame"}>ro</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex items-center">
      {mark}
    </Link>
  );
}
