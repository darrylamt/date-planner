/** Reading when a menu price applies, for the CSV importer. */
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * "Mon-Thu", "Fri;Sat", "weekdays", "weekends", "Sun" into 0-6 day numbers.
 * Semicolons, not commas, because the file itself is comma-separated. Null
 * when any part cannot be read, so the row is refused rather than guessed.
 */
export function parseDays(raw: string): number[] | null {
  const out = new Set<number>();
  for (const part of raw.toLowerCase().split(/[;/ ]+/).filter(Boolean)) {
    if (part === "weekdays") [1, 2, 3, 4, 5].forEach((d) => out.add(d));
    else if (part === "weekends") [0, 6].forEach((d) => out.add(d));
    else if (part.includes("-")) {
      const [a, b] = part.split("-").map((p) => DAY_NAMES.indexOf(p.slice(0, 3)));
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
    } else {
      const d = DAY_NAMES.indexOf(part.slice(0, 3));
      if (d < 0) return null;
      out.add(d);
    }
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** "16:00" or "4pm" into minutes from midnight; null when unreadable. */
export function parseClock(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h <= 24 && min < 60 ? h * 60 + min : null;
}

/** Venue, name, days and start time: what makes a menu row the same row. */
export function itemKey(venueId: unknown, name: unknown, days: unknown, from: unknown): string {
  const d = Array.isArray(days) && days.length ? [...days].sort().join(",") : "all";
  return `${venueId}::${String(name ?? "").trim().toLowerCase()}::${d}::${from ?? "any"}`;
}
