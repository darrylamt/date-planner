"use client";

import { useState } from "react";

/** Compact month calendar from the "when's the date?" step design. */
export function MonthCalendar({
  value,
  onChange,
}: {
  value: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = value ? new Date(`${value}T12:00:00`) : today;
  const [view, setView] = useState({ y: selected.getFullYear(), m: selected.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();

  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isoFor = (day: number) =>
    `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div className="card px-5 py-[18px]">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-bold">{monthLabel}</span>
        <span className="flex gap-4 text-[14px] text-mutedbrown">
          <button
            type="button"
            aria-label="Previous month"
            className="px-1 hover:text-flame"
            onClick={() => setView(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            className="px-1 hover:text-flame"
            onClick={() => setView(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}
          >
            ›
          </button>
        </span>
      </div>

      <div className="mt-3.5 grid grid-cols-7 gap-1.5 text-center text-[14px] text-mutedbrown">
        {["M", "T", "W", "T2", "F", "S", "S2"].map((d) => (
          <span key={d}>{d.replace("2", "")}</span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1.5 text-center text-[15px]">
        {cells.map((day, i) => {
          if (day === null) return <span key={`x-${i}`} />;
          const iso = isoFor(day);
          const date = new Date(`${iso}T12:00:00`);
          const past = date < today;
          const isSelected = iso === value;
          return (
            <button
              key={iso}
              type="button"
              disabled={past}
              onClick={() => onChange(iso)}
              className={`rounded-[10px] py-1.5 transition-colors ${
                isSelected
                  ? "bg-flame font-bold text-cream"
                  : past
                    ? "cursor-not-allowed text-mutedbrown/50"
                    : "hover:bg-sand"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
