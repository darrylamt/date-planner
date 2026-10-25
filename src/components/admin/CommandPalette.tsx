"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminCounts } from "@/lib/adminCounts";
import { AdminIcon, type IconName } from "./AdminIcon";
import { badgeCount, groupsFor } from "./adminNavModel";
import type { StaffRole } from "@/lib/staffRoles";

export interface PaletteVenue {
  id: string;
  name: string;
  area: string | null;
  active: boolean;
}

type Item = { key: string; section: string; label: string; sub?: string; icon: IconName; href: string; haystack: string };

/**
 * Jump anywhere: every admin page, and every venue by name. Ctrl K or ⌘K,
 * or "/" when not typing; arrows to move, Enter to go, Escape to close.
 *
 * Venue names come with the layout's counts, so opening this costs nothing.
 */
export function CommandPalette({
  counts,
  venues,
  onClose,
  access,
}: {
  counts: AdminCounts | null;
  venues: PaletteVenue[] | null;
  onClose: () => void;
  access: { isAdmin: boolean; roles: StaffRole[] };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo<Item[]>(() => {
    // A venue opens where this login works on it: the full form for an admin,
    // the menu or the photos for staff, nowhere for events staff.
    const venuePage = access.isAdmin
      ? (id: string) => `/admin/venues/${id}`
      : access.roles.includes("menus")
        ? (id: string) => `/admin/menu/${id}`
        : access.roles.includes("photos")
          ? (id: string) => `/admin/photos/${id}`
          : null;
    const pages: Item[] = groupsFor(access).flatMap((g) =>
      g.links.map((l) => {
        const n = badgeCount(l, counts);
        return {
          key: l.href,
          section: "Pages",
          label: l.label,
          sub: n > 0 ? `${n} ${l.urgent ? "waiting" : ""}`.trim() : g.label,
          icon: l.icon,
          href: l.href,
          haystack: `${l.label} ${g.label} ${l.keywords ?? ""}`.toLowerCase(),
        };
      })
    );
    const places: Item[] = (venuePage ? venues ?? [] : []).map((v) => ({
      key: v.id,
      section: "Venues",
      label: v.name,
      sub: [v.area, v.active ? null : "switched off"].filter(Boolean).join(" · "),
      icon: "store",
      href: venuePage!(v.id),
      haystack: `${v.name} ${v.area ?? ""}`.toLowerCase(),
    }));
    return [...pages, ...places];
  }, [counts, venues, access]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all.filter((i) => i.section === "Pages");
    const hits = all.filter((i) => words.every((w) => i.haystack.includes(w)));
    // Names that start with what was typed first, then the rest as they come.
    const first = words[0];
    hits.sort((a, b) => Number(!a.label.toLowerCase().startsWith(first)) - Number(!b.label.toLowerCase().startsWith(first)));
    const pages = hits.filter((i) => i.section === "Pages");
    return [...pages, ...hits.filter((i) => i.section === "Venues").slice(0, 40)];
  }, [all, query]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(shown[index]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  let lastSection = "";
  return (
    <div className="adm-palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adm-palette" role="dialog" aria-modal="true" aria-label="Jump to">
        <div className="relative">
          <AdminIcon name="search" size={18} className="pointer-events-none absolute left-4 top-[18px] text-mutedbrown" />
          <input
            autoFocus
            className="adm-palette-input"
            placeholder={venues ? "Search pages and venues…" : "Search pages… (venues are loading)"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded="true"
            aria-controls="adm-palette-list"
          />
        </div>
        <div className="adm-palette-list" id="adm-palette-list" role="listbox" ref={listRef}>
          {shown.length === 0 ? (
            <div className="px-3 py-8 text-center text-[14px] text-mutedbrown">Nothing called that.</div>
          ) : (
            shown.map((item, i) => {
              const head = item.section !== lastSection ? item.section : null;
              lastSection = item.section;
              return (
                <div key={`${item.section}:${item.key}`}>
                  {head ? <div className="adm-palette-head">{head}</div> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    className="adm-palette-item"
                    onMouseMove={() => i !== index && setIndex(i)}
                    onClick={() => go(item)}
                  >
                    <AdminIcon name={item.icon} size={16} />
                    <span className="truncate">{item.label}</span>
                    {item.sub ? <span className="adm-palette-sub">{item.sub}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex gap-4 border-t border-line px-4 py-2 text-[11.5px] text-mutedbrown">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
