"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { periodsFrom, weekFrom, type DayHours } from "@/components/admin/HoursEditor";
import { alwaysOpenPeriods, isAlwaysOpen, parsePeriods } from "@/lib/hours";
import { SaveBar, Switch, useToast } from "./ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Monday first, the way a week is read here. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Opening hours, a row a day.
 *
 * The conversion to and from periods is the admin grid's own (weekFrom and
 * periodsFrom), so the subtle case behaves the same: a day Google gave two
 * windows is shown locked and carried over untouched rather than flattened.
 *
 * A venue's save clears Google's text rendering of the hours, because the
 * venue is a better source about its own door than Google is.
 */
export function WeekHours({ venueId, raw }: { venueId: string; raw: unknown }) {
  const router = useRouter();
  const [base, setBase] = useState(raw);
  const startAlways = isAlwaysOpen(parsePeriods(raw));
  const startWeek = weekFrom(raw);
  const [always, setAlways] = useState(startAlways);
  const [week, setWeek] = useState<DayHours[]>(startWeek);
  const [saved, setSaved] = useState({ always: startAlways, week: startWeek });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const { say, toast } = useToast();
  const known = Boolean(parsePeriods(raw)?.length);

  const dirty = always !== saved.always || JSON.stringify(week) !== JSON.stringify(saved.week);
  const setDay = (d: number, patch: Partial<DayHours>) => setWeek((w) => w.map((x, i) => (i === d ? { ...x, ...patch } : x)));

  function sameEveryDay() {
    const model = ORDER.map((d) => week[d]).find((d) => !d.closed && !d.split);
    if (!model) return say("Open one day first, then copy it.", false);
    setWeek((w) => w.map((x) => (x.split ? x : { ...x, closed: false, open: model.open, close: model.close })));
    setFlash(true);
    setTimeout(() => setFlash(false), 700);
  }

  async function save() {
    const periods = always ? alwaysOpenPeriods() : periodsFrom(week, base);
    setBusy(true);
    const { error } = await createClient()
      .from("venues")
      .update({ opening_periods: periods, opening_hours_text: null, hours_synced_at: new Date().toISOString() })
      .eq("id", venueId);
    setBusy(false);
    if (error) return say("That did not save. Try again.", false);
    setBase(periods);
    setSaved({ always, week });
    say("Hours saved");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!known ? (
        <div className="pl-up rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
          <b>We don&apos;t know your hours yet,</b> so we&apos;re careful about sending people to you. Set them below and save.
        </div>
      ) : null}

      <div className="pl-up flex gap-2" style={{ animationDelay: "40ms" }}>
        <button type="button" className="pl-chip whitespace-nowrap" aria-pressed={!always} onClick={() => setAlways(false)}>
          Day by day
        </button>
        <button type="button" className="pl-chip whitespace-nowrap" aria-pressed={always} onClick={() => setAlways(true)}>
          Open 24 hours
        </button>
      </div>

      {always ? (
        <div className="pl-card pl-pop p-6 text-center">
          <div className="text-[40px]">🌙☀️</div>
          <div className="mt-2 text-[18px] font-bold">Always open</div>
          <p className="mt-1 text-[14px] text-[var(--p-muted)]">For somewhere with no door to lock, like a beach or a park.</p>
        </div>
      ) : (
        <>
          <div className="pl-card pl-up divide-y divide-[var(--p-line)] overflow-hidden" style={{ animationDelay: "80ms" }}>
            {ORDER.map((d, n) => {
              const day = week[d];
              return (
                <div
                  key={d}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors duration-500 ${flash && !day.split ? "bg-[var(--p-ok-soft)]" : ""}`}
                  style={{ transitionDelay: flash ? `${n * 40}ms` : "0ms" }}
                >
                  <div className="flex min-w-[150px] flex-1 items-center gap-3">
                    <Switch on={!day.closed} onChange={(open) => setDay(d, { closed: !open })} label={`Open on ${DAYS[d]}`} disabled={day.split} />
                    <span className="text-[16px] font-bold">{DAYS[d]}</span>
                  </div>
                  {day.split ? (
                    <span className="text-[13px] text-[var(--p-muted)]">Two openings that day, kept as they are</span>
                  ) : day.closed ? (
                    <span className="pl-fade text-[15px] font-semibold text-[var(--p-muted)]">Closed</span>
                  ) : (
                    <div className="pl-fade flex w-full items-center gap-2 sm:w-auto">
                      <input
                        type="time"
                        aria-label={`${DAYS[d]} opens`}
                        className="pl-input !min-h-[46px] min-w-0 flex-1 sm:!w-[148px] sm:flex-none !px-3 tabular-nums"
                        value={day.open}
                        onChange={(e) => setDay(d, { open: e.target.value })}
                      />
                      <span className="text-[14px] font-semibold text-[var(--p-muted)]">to</span>
                      <input
                        type="time"
                        aria-label={`${DAYS[d]} closes`}
                        className="pl-input !min-h-[46px] min-w-0 flex-1 sm:!w-[148px] sm:flex-none !px-3 tabular-nums"
                        value={day.close}
                        onChange={(e) => setDay(d, { close: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="pl-btn-soft pl-up w-full sm:w-auto sm:self-start" style={{ animationDelay: "120ms" }} onClick={sameEveryDay}>
            Same hours every day
          </button>
          <p className="pl-hint pl-up" style={{ animationDelay: "140ms" }}>
            Open past midnight? Put the closing time after the opening one, like 18:00 to 02:00, and we&apos;ll know it runs into the next day.
          </p>
        </>
      )}

      <SaveBar
        dirty={dirty}
        busy={busy}
        label="Save hours"
        onSave={() => void save()}
        onUndo={() => {
          setAlways(saved.always);
          setWeek(saved.week);
        }}
      />
      {toast}
    </div>
  );
}
