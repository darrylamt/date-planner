/**
 * A stored link, as something safe to put in an href.
 *
 * Venue logins, planners, vendors and scraped pages all write URLs that admin
 * and portal screens render as links. React 18 renders a javascript: href
 * as-is, so one of those would run in whoever clicked it. Only http(s) links
 * get through; anything else renders as no link at all.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

/**
 * Where to send someone after signing in, from a ?next= value.
 *
 * Only a path on this site: "/admin" yes, "//elsewhere.com" or
 * "https://elsewhere.com" or "javascript:..." no. Anything else goes to the
 * fallback.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
