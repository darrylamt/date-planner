"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AdminCounts } from "@/lib/adminCounts";
import { Logo } from "@/components/Logo";
import { AdminIcon } from "./AdminIcon";
import { ADMIN_GROUPS, activeLink, badgeCount, badgeUrgent } from "./adminNavModel";
import { CommandPalette, type PaletteVenue } from "./CommandPalette";

/**
 * The admin's frame: the sidebar, the phone's top bar, and the search.
 *
 * Drawn at once with no counts, then again when the counts arrive (the layout
 * streams them), so the page never waits on a badge. On a phone the sidebar
 * is a drawer behind the menu button, so content starts at the top of the
 * screen rather than a screen down.
 */
export function AdminChrome({
  counts,
  venues,
  email,
}: {
  counts: AdminCounts | null;
  venues: PaletteVenue[] | null;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const current = activeLink(pathname);

  // Navigating closes the drawer, or the next page opens under it.
  useEffect(() => setDrawer(false), [pathname]);

  // Ctrl K or ⌘K anywhere; "/" when not typing in a box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === "Escape") {
        setDrawer(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      {/* The phone's bar: the menu, where you are, the search. */}
      <header className="adm-topbar">
        <button type="button" className="adm-icon-btn" onClick={() => setDrawer(true)} aria-label="Open the menu">
          <AdminIcon name="menu" size={20} />
        </button>
        <div className="adm-topbar-title">{current?.label ?? "Admin"}</div>
        <button type="button" className="adm-icon-btn" onClick={() => setPalette(true)} aria-label="Search the admin">
          <AdminIcon name="search" size={19} />
        </button>
      </header>
      {drawer ? <div className="adm-scrim" onClick={() => setDrawer(false)} aria-hidden="true" /> : null}

      <aside className="adm-sidebar" data-open={drawer} aria-label="Admin">
        <div className="adm-brand">
          <Logo size={20} href="/admin" />
          <span className="adm-brand-tag">Admin</span>
          <button
            type="button"
            className="adm-icon-btn adm-drawer-close ml-auto"
            onClick={() => setDrawer(false)}
            aria-label="Close the menu"
          >
            <AdminIcon name="x" size={18} />
          </button>
        </div>

        <button type="button" className="adm-search" onClick={() => setPalette(true)}>
          <AdminIcon name="search" size={15} />
          <span>Jump to…</span>
          <span className="adm-kbd">{mac ? "⌘K" : "Ctrl K"}</span>
        </button>

        <nav className="adm-nav">
          {ADMIN_GROUPS.map((g) => (
            <div key={g.label} className="adm-group">
              <div className="adm-group-label">{g.label}</div>
              {g.links.map((l) => {
                const n = badgeCount(l, counts);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="adm-link"
                    aria-current={current?.href === l.href ? "page" : undefined}
                  >
                    <AdminIcon name={l.icon} />
                    <span className="truncate">{l.label}</span>
                    {l.badge && counts === null ? (
                      <span className="adm-count-skel adm-skel" aria-hidden="true" />
                    ) : n > 0 ? (
                      <span className="adm-count" data-urgent={badgeUrgent(l, counts) ? "" : undefined}>
                        {n > 999 ? "999+" : n}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="adm-foot">
          <span className="adm-avatar" aria-hidden="true">
            {(email[0] ?? "A").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-mutedbrown" title={email}>
            {email}
          </span>
          <a href="/" className="adm-icon-btn" title="Open the site" aria-label="Open the site">
            <AdminIcon name="external" size={16} />
          </a>
          <button type="button" onClick={signOut} className="adm-icon-btn" title="Sign out" aria-label="Sign out">
            <AdminIcon name="logout" size={16} />
          </button>
        </div>
      </aside>

      {palette ? <CommandPalette counts={counts} venues={venues} onClose={() => setPalette(false)} /> : null}
    </>
  );
}
