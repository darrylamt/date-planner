import Link from "next/link";

/**
 * The window an admin page's numbers cover: 7, 30 or 90 days, or all time,
 * as ?period= so a link or a refresh keeps it.
 */
export const PERIODS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;

export type Period = (typeof PERIODS)[number];

export function periodFrom(raw: string | undefined): Period & { since: string | null; heading: string } {
  const p = PERIODS.find((x) => x.key === raw) ?? PERIODS[0];
  return {
    ...p,
    since: p.days ? new Date(Date.now() - p.days * 864e5).toISOString() : null,
    heading: p.days ? `The last ${p.days} days` : "All time",
  };
}

/** The switch: 7 days · 30 days · 90 days · All time. `path` is the page it sits on. */
export function PeriodPicker({ path, current }: { path: string; current: string }) {
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-white p-0.5" role="tablist" aria-label="Period">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={p.key === "7" ? path : `${path}?period=${p.key}`}
          role="tab"
          aria-selected={p.key === current}
          className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            p.key === current ? "bg-[#1a1718] text-white" : "text-cocoa hover:bg-[#f1efec]"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
