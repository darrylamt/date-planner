"use client";

import { useMemo, useRef, useState } from "react";
import { fold } from "@/lib/fold";

type V = { id: string; name: string; area_id: string };

/**
 * Pick a venue by typing (owner, 19 Nov 2026: events staff scrolled a select
 * of every venue). Matches ignore accents and case, any word may match, and
 * each shows its area so two branches of one name can be told apart.
 */
export function VenuePicker({
  venues,
  areaName,
  value,
  onChange,
}: {
  venues: V[];
  areaName: (id: string) => string | undefined;
  value: string;
  onChange: (id: string) => void;
}) {
  const chosen = venues.find((v) => v.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return venues
      .map((v) => ({ v, hay: fold(`${v.name} ${areaName(v.area_id) ?? ""}`) }))
      .filter(({ hay }) => words.every((w) => hay.includes(w)))
      .sort((a, b) => Number(!a.hay.startsWith(words[0])) - Number(!b.hay.startsWith(words[0])) || a.v.name.localeCompare(b.v.name))
      .slice(0, 12)
      .map(({ v }) => v);
  }, [query, venues, areaName]);

  const pick = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  if (chosen && !open) {
    return (
      <div className="flex h-[42px] items-center gap-2">
        <div className="inp flex h-[42px] min-w-0 flex-1 items-center truncate">
          <span className="truncate font-semibold">{chosen.name}</span>
          {areaName(chosen.area_id) ? <span className="ml-2 shrink-0 text-[13px] text-mutedbrown">{areaName(chosen.area_id)}</span> : null}
        </div>
        <button type="button" className="btn2 btnsm" onClick={() => setOpen(true)}>
          Change
        </button>
        <button type="button" className="btn2 btnsm" onClick={() => pick("")}>
          Clear
        </button>
      </div>
    );
  }

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        className="inp h-[42px] w-full"
        placeholder="Search venues by name or area"
        value={query}
        autoFocus={open}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && matches[active]) {
            e.preventDefault();
            pick(matches[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && query.trim() ? (
        <div role="listbox" className="absolute left-0 right-0 top-[46px] z-20 max-h-[320px] overflow-auto rounded-lg border border-black/15 bg-white p-1 shadow-lg">
          {matches.length ? (
            matches.map((v, i) => (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[14px] ${i === active ? "bg-black/[0.06]" : "hover:bg-black/[0.04]"}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(v.id)}
              >
                <span className="truncate font-semibold">{v.name}</span>
                <span className="shrink-0 text-[12px] text-mutedbrown">{areaName(v.area_id) ?? ""}</span>
              </button>
            ))
          ) : (
            <div className="px-2 py-2 text-[13px] text-mutedbrown">No venue matches. Add it from Google below.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
