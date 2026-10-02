import Link from "next/link";

/** 20 October to 1 November, on Accra's clock, which is UTC all year. */
export function isHalloween(at = new Date()): boolean {
  const m = at.getUTCMonth() + 1;
  const d = at.getUTCDate();
  return (m === 10 && d >= 20) || (m === 11 && d <= 1);
}

/**
 * Wordmark from the design: Du<b>ro!</b>.
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
      className={`font-display font-bold tracking-[-0.01em] ${dark ? "text-lagoon-faint" : "text-ink"}`}
      style={{ fontSize: size }}
    >
      Du
      <span className={dark ? "text-amber" : "text-flame"}>ro!</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex items-center">
      {mark}
    </Link>
  );
}
