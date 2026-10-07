/**
 * Count one step from a shared plan towards the app (migration 0070).
 *
 * Sent as a beacon, so a tap that is also leaving the page for the App Store
 * still arrives, and nothing the visitor does waits on it. Anonymous: no
 * identifier is sent or kept, on either side.
 */
export function trackShare(
  kind: "view" | "plan_your_own" | "app_store",
  page: "shared_plan" | "get" | "home" | "name_poll" | "split",
  slug?: string | null
): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(slug ? { kind, page, slug } : { kind, page });
  try {
    if (navigator.sendBeacon?.("/api/share-event", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/share-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
