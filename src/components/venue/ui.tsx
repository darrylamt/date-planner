"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconCheck } from "@/components/planner/icons";

/**
 * The venue portal's small parts: an on/off switch, a save bar that only
 * appears when there is something to save, a toast, and a section card.
 * In the planner's light theme (.planner in globals.css).
 */

export function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`pl-tap relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 ${
        on ? "bg-[var(--p-ok)]" : "bg-[#d9cdc8]"
      }`}
    >
      <span
        className={`absolute left-0 top-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-[24px]" : "translate-x-1"}`}
      />
    </button>
  );
}

/** A labelled row with a switch on the right: the whole row is the target. */
export function SwitchRow({
  on,
  onChange,
  title,
  sub,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  title: string;
  sub?: string;
}) {
  return (
    <div
      className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-[var(--p-sunken)] px-4 py-3.5"
      onClick={() => onChange(!on)}
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{title}</span>
        {sub ? <span className="block text-[13px] leading-snug text-[var(--p-muted)]">{sub}</span> : null}
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <Switch on={on} onChange={onChange} label={title} />
      </span>
    </div>
  );
}

/**
 * Slides up from the bottom once something has changed, and goes away once
 * it is saved. Sits above the phone's tab bar.
 */
export function SaveBar({
  dirty,
  busy,
  onSave,
  onUndo,
  label = "Save changes",
}: {
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onUndo?: () => void;
  label?: string;
}) {
  if (!dirty) return null;
  return (
    <div className="pl-sheet fixed inset-x-0 bottom-[78px] z-40 px-3 lg:bottom-6">
      <div className="mx-auto flex max-w-[620px] items-center gap-3 rounded-[22px] bg-[var(--p-ink)] py-2.5 pl-5 pr-2.5 text-white shadow-[0_18px_40px_-12px_rgb(28_18_22/0.6)]">
        <span className="flex-1 text-[14.5px] font-semibold">You have unsaved changes</span>
        {onUndo ? (
          <button type="button" className="rounded-xl px-3 py-2 text-[14px] font-bold text-white/70 hover:text-white" onClick={onUndo} disabled={busy}>
            Undo
          </button>
        ) : null}
        <button type="button" className="pl-btn !min-h-[44px] !px-5 !text-[15px]" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

/** One line at the bottom of the screen for a few seconds. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean; key: number } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(t);
  }, [msg]);
  const say = (text: string, ok = true) => setMsg({ text, ok, key: Date.now() });
  const node = msg ? (
    <div key={msg.key} className="pointer-events-none fixed inset-x-0 bottom-[96px] z-[60] flex justify-center px-4 lg:bottom-8" role="status">
      <div
        className={`pl-pop flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold shadow-xl ${
          msg.ok ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-accent)] text-white"
        }`}
      >
        {msg.ok ? (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--p-ok)]">
            <IconCheck size={13} />
          </span>
        ) : null}
        {msg.text}
      </div>
    </div>
  ) : null;
  return { say, toast: node };
}

export function Section({
  title,
  sub,
  children,
  delay = 0,
  id,
  action,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  delay?: number;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <section id={id} className="pl-card pl-up scroll-mt-24 p-5 md:p-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold leading-tight">{title}</h2>
          {sub ? <p className="mt-1 text-[14px] leading-snug text-[var(--p-muted)]">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A score, drawn as a ring that fills when the page opens. */
export function Ring({ value, size = 84, stroke = 9 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const full = 2 * Math.PI * r;
  const offset = full * (1 - Math.max(0, Math.min(100, value)) / 100);
  const colour = value >= 100 ? "var(--p-ok)" : value >= 60 ? "var(--p-gold)" : "var(--p-accent)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--p-sunken)" strokeWidth={stroke} />
        <circle
          className="pl-ring"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={full}
          strokeDashoffset={offset}
          style={{ ["--ring-from" as string]: full }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[19px] font-bold tabular-nums">{value}%</span>
    </div>
  );
}

/** A number box with − and + either side, for party sizes. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 500,
  blankLabel,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  /** When set, the value may be blank (null), shown as this. */
  blankLabel?: string;
}) {
  const n = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Fewer"
        className="pl-tap grid h-11 w-11 place-items-center rounded-xl bg-white text-[22px] font-bold ring-1 ring-[var(--p-line)] disabled:opacity-40"
        disabled={value == null || n <= min}
        onClick={() => onChange(Math.max(min, n - 1))}
      >
        −
      </button>
      <span className="min-w-[72px] text-center text-[18px] font-bold tabular-nums">{value == null ? blankLabel ?? "—" : value}</span>
      <button
        type="button"
        aria-label="More"
        className="pl-tap grid h-11 w-11 place-items-center rounded-xl bg-white text-[22px] font-bold ring-1 ring-[var(--p-line)] disabled:opacity-40"
        disabled={n >= max}
        onClick={() => onChange(value == null ? Math.max(min, 2) : Math.min(max, n + 1))}
      >
        +
      </button>
      {blankLabel && value != null ? (
        <button type="button" className="ml-1 text-[13px] font-bold text-[var(--p-muted)] underline" onClick={() => onChange(null)}>
          {blankLabel}
        </button>
      ) : null}
    </div>
  );
}
