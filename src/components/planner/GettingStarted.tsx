"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconArrow, IconCheck } from "./icons";

/**
 * What is left before a planner is fully set up, with a ring that fills as
 * they go. It leaves the home screen once everything is done, because a
 * finished checklist is just something to scroll past.
 */
export function GettingStarted({ hasNight, hasLogo, hasPoster }: { hasNight: boolean; hasLogo: boolean; hasPoster: boolean }) {
  const steps = [
    { done: hasNight, title: "Put your first night on", body: "A name, a date, a place and a price. About a minute.", href: "/planner/nights/new", cta: "Start" },
    { done: hasLogo, title: "Add your logo", body: "It sits beside \"Hosted by\" on every one of your nights.", href: "/planner/profile", cta: "Add" },
    { done: hasPoster, title: "Give a night a poster", body: "The first thing people see. Edit a night to add one.", href: "/planner", cta: null },
  ];
  const count = steps.filter((s) => s.done).length;

  // Filled after arrival, so the ring visibly moves rather than appearing full.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(count), 150);
    return () => clearTimeout(t);
  }, [count]);

  if (count === steps.length) return null;
  const r = 22;
  const circumference = 2 * Math.PI * r;

  return (
    <section className="pl-card pl-up mb-6 p-4 md:p-5">
      <div className="flex items-center gap-4">
        <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0 -rotate-90" aria-hidden>
          <circle cx="28" cy="28" r={r} fill="none" stroke="var(--p-line)" strokeWidth="6" />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke="var(--p-accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown / steps.length)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2,0.8,0.2,1)" }}
          />
        </svg>
        <div>
          <div className="text-[17px] font-bold">Get set up</div>
          <div className="text-[14px] text-[var(--p-muted)]">
            {count} of {steps.length} done. Each one gets your nights picked more.
          </div>
        </div>
      </div>

      <ol className="mt-4 grid gap-2">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${s.done ? "" : "bg-[var(--p-sunken)]"}`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold ${
                s.done ? "pl-pop bg-[var(--p-ok)] text-white" : "bg-white text-[var(--p-muted)] ring-1 ring-[var(--p-line)]"
              }`}
            >
              {s.done ? <IconCheck size={16} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[15px] font-semibold ${s.done ? "text-[var(--p-muted)] line-through" : ""}`}>{s.title}</div>
              {!s.done ? <div className="text-[13px] text-[var(--p-muted)]">{s.body}</div> : null}
            </div>
            {!s.done && s.cta ? (
              <Link href={s.href} className="pl-btn !min-h-[40px] !rounded-xl !px-4 !text-[14px]">
                {s.cta} <IconArrow size={16} />
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
