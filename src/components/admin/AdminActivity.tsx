"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AdminIcon } from "./AdminIcon";

type Toast = { id: number; kind: "ok" | "error"; text: string };

/** How long after a click a request still counts as that click's. */
const CLICK_WINDOW_MS = 1500;

/**
 * Whether anything is happening, answered for every button and link in the
 * admin at once.
 *
 * Fifty-odd screens each handled their own clicks, and most showed nothing
 * between the press and the result: a Save that took two seconds looked like
 * a Save that had not registered, so it was pressed again. Rather than
 * rewrite every one of them, this watches from outside:
 *
 * - A request that starts within a moment of a click belongs to that
 *   button. The button is marked busy (a spinner on its corner, no second
 *   press) until every such request is answered, then flashes green, or
 *   shakes red with a message if one failed. A write that worked says
 *   "Done". A read that failed with a 4xx stays quiet, because some screens
 *   look things up expecting not to find them.
 * - Any request at all, and any move to another page, runs the thin bar
 *   along the top. The link that was clicked spins until the page arrives.
 *
 * Next's own prefetches are left out: they happen on hover and mean nothing.
 */
export function AdminActivity() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [inflight, setInflight] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // A new page has arrived: stop the bar and the spinning link.
  useEffect(() => {
    setNavigating(false);
    document.querySelectorAll("[data-pending]").forEach((el) => el.removeAttribute("data-pending"));
  }, [pathname, search]);

  useEffect(() => {
    function toast(kind: Toast["kind"], text: string) {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-3), { id, kind, text }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 2200);
    }

    function flash(el: HTMLElement, how: "done" | "error") {
      el.removeAttribute("data-flash");
      void el.offsetWidth; // restart the animation if it is already showing
      el.setAttribute("data-flash", how);
      setTimeout(() => el.getAttribute("data-flash") === how && el.removeAttribute("data-flash"), 1800);
    }

    // ── Clicks ─────────────────────────────────────────────────────────
    let last: { el: HTMLElement; at: number } | null = null;
    let navTimer: ReturnType<typeof setTimeout> | null = null;

    function onClick(e: MouseEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const button = target.closest<HTMLElement>('button, [role="button"], input[type="submit"]');
      if (button && !(button as HTMLButtonElement).disabled) last = { el: button, at: performance.now() };

      const a = target.closest<HTMLAnchorElement>("a[href]");
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      a.setAttribute("data-pending", "");
      setNavigating(true);
      if (navTimer) clearTimeout(navTimer);
      // Never spin forever if the page never changes (a link the router ignored).
      navTimer = setTimeout(() => {
        setNavigating(false);
        a.removeAttribute("data-pending");
      }, 15000);
    }
    document.addEventListener("click", onClick, true);

    // A confirm() or prompt() holds the click open while it is answered.
    const realConfirm = window.confirm;
    const realPrompt = window.prompt;
    window.confirm = (m?: string) => {
      const r = realConfirm.call(window, m);
      if (last) last.at = performance.now();
      return r;
    };
    window.prompt = (m?: string, d?: string) => {
      const r = realPrompt.call(window, m, d);
      if (last) last.at = performance.now();
      return r;
    };

    // ── Requests ───────────────────────────────────────────────────────
    const owned = new Map<HTMLElement, { n: number; wrote: boolean; failed: string | null }>();
    const realFetch = window.fetch;

    function headerOf(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string | null {
      const h = init?.headers ?? (input instanceof Request ? input.headers : undefined);
      if (!h) return null;
      if (h instanceof Headers) return h.get(name);
      if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
      const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? (h as Record<string, string>)[key] : null;
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (headerOf(input, init, "Next-Router-Prefetch")) return realFetch(input, init);

      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const write = method !== "GET" && method !== "HEAD";
      const owner = last && performance.now() - last.at < CLICK_WINDOW_MS && last.el.isConnected ? last.el : null;

      setInflight((n) => n + 1);
      if (owner) {
        const s = owned.get(owner) ?? { n: 0, wrote: false, failed: null };
        s.n += 1;
        s.wrote ||= write;
        owned.set(owner, s);
        owner.setAttribute("data-busy", "");
        owner.setAttribute("aria-busy", "true");
      }

      let failure: string | null = null;
      try {
        const res = await realFetch(input, init);
        if (!res.ok && (write || res.status >= 500)) failure = await reason(res);
        return res;
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") failure = "Couldn't reach the server. Check the connection and try again.";
        throw err;
      } finally {
        setInflight((n) => Math.max(0, n - 1));
        if (owner) {
          const s = owned.get(owner)!;
          s.n -= 1;
          s.failed ||= failure;
          if (s.n <= 0) {
            owned.delete(owner);
            owner.removeAttribute("data-busy");
            owner.removeAttribute("aria-busy");
            if (s.failed) {
              flash(owner, "error");
              toast("error", s.failed);
            } else if (s.wrote) {
              flash(owner, "done");
              toast("ok", "Done");
            }
          }
        } else if (failure && write) {
          toast("error", failure);
        }
      }
    };

    return () => {
      document.removeEventListener("click", onClick, true);
      window.fetch = realFetch;
      window.confirm = realConfirm;
      window.prompt = realPrompt;
      if (navTimer) clearTimeout(navTimer);
    };
  }, []);

  return (
    <>
      <div className="adm-progress" data-on={inflight > 0 || navigating} aria-hidden="true" />
      <div className="adm-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="adm-toast" data-kind={t.kind}>
            <span className="adm-toast-dot">
              <AdminIcon name={t.kind === "ok" ? "check" : "alert"} size={12} />
            </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** What went wrong, in a sentence, from whatever the server sent back. */
async function reason(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = await res.clone().json();
    detail = String(body?.error ?? body?.message ?? body?.msg ?? "").trim();
  } catch {
    // Not JSON: the status will do.
  }
  if (res.status === 401 || res.status === 403) return "Not allowed. Your session may have ended: sign in again.";
  const base = detail ? detail.slice(0, 160) : `The server answered ${res.status}.`;
  return `That didn't save. ${base}`;
}
