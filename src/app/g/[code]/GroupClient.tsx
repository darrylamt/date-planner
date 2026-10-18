"use client";

import { useEffect, useMemo, useState } from "react";
import { Wordmark } from "@/components/planner/PlannerShell";
import { VIBES } from "@/lib/planConstants";
import {
  HARD_NOS,
  SLOTS,
  SLOT_LABEL,
  datesInRange,
  type Availability,
  type GroupMe,
  type GroupPublic,
  type HardNo,
  type Slot,
} from "@/lib/groups";

/**
 * The answer form, and afterwards "you're in" and your own order.
 *
 * The edit token comes back once, the first time this browser answers, and is
 * kept in localStorage so the same person can change their answer later.
 * Cleared storage loses it; the organiser can remove the old answer.
 */
const ghs = (n: number) => `GHS ${Math.round(n).toLocaleString("en-GB")}`;

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

interface Stored {
  memberId: string;
  token: string;
}

export function GroupClient({ initial, appStore }: { initial: GroupPublic; appStore: string }) {
  const key = `duro.group.${initial.code}`;
  const [group, setGroup] = useState(initial);
  const [stored, setStored] = useState<Stored | null>(null);
  const [me, setMe] = useState<GroupMe | null>(null);
  const [editing, setEditing] = useState(false);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);

  // The days the organiser offered: chosen days, or every day of the range.
  const dates = useMemo(
    () => (group.days?.length ? group.days : datesInRange(group.dateFrom, group.dateTo)),
    [group.days, group.dateFrom, group.dateTo]
  );
  const [name, setName] = useState("");
  const [availability, setAvailability] = useState<Availability>({});
  const [budget, setBudget] = useState(300);
  const [vibes, setVibes] = useState<string[]>([]);
  const [nos, setNos] = useState<HardNo[]>([]);
  const [tags, setTags] = useState("");
  const [fromAreaId, setFromAreaId] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What this browser already answered, if anything.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setStored(JSON.parse(raw) as Stored);
    } catch {
      /* private window: answer as new */
    }
    fetch("/api/areas")
      .then((r) => r.json())
      .then((d: { areas?: { id: string; name: string }[] }) => setAreas(d.areas ?? []))
      .catch(() => setAreas([]));
  }, [key]);

  useEffect(() => {
    if (!stored) return;
    fetch(`/api/groups/${initial.code}/me`, { headers: { "X-Group-Token": stored.token }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GroupMe | null) => {
        if (!d) return;
        setMe(d);
        if (d.answer) {
          setName(d.answer.name);
          setAvailability(d.answer.availability);
          setBudget(d.answer.budget);
          setVibes(d.answer.vibes);
          setNos(d.answer.hardNos);
          setTags(d.answer.tags.join(", "));
          setFromAreaId(d.answer.fromAreaId ?? "");
        }
      })
      .catch(() => null);
  }, [stored, initial.code]);

  const toggleSlot = (date: string, slot: Slot) =>
    setAvailability((cur) => {
      const now = new Set(cur[date] ?? []);
      if (now.has(slot)) now.delete(slot);
      else now.add(slot);
      return { ...cur, [date]: [...now] as Slot[] };
    });
  const toggle = <T,>(list: T[], item: T, max = Infinity) =>
    list.includes(item) ? list.filter((x) => x !== item) : list.length >= max ? list : [...list, item];

  async function send() {
    if (name.trim().length < 2) return setError("What should the group call you?");
    if (!Object.values(availability).some((s) => s.length)) return setError("Tick at least one time you can make it.");
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/groups/${initial.code}/answer`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(stored ? { "X-Group-Token": stored.token } : {}) },
      body: JSON.stringify({
        name,
        availability,
        budget,
        vibes,
        hardNos: nos,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5),
        fromAreaId: fromAreaId || null,
        website,
      }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { memberId?: string; token?: string; error?: string } | null;
    if (!res?.ok || !body) {
      const why = body?.error;
      return setError(
        why === "name_taken"
          ? "Someone in the group already has that name. Add an initial."
          : why === "group_full"
            ? "This group is full."
            : why === "locked"
              ? "The plan is already set."
              : why === "name"
                ? "Use letters and numbers for your name."
                : "That didn't send. Check your connection and try again."
      );
    }
    if (body.token && body.memberId) {
      const next = { memberId: body.memberId, token: body.token };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* still answered; just not editable from here */
      }
      setStored(next);
    }
    setEditing(false);
    setMe((cur) => (cur ? { ...cur, answer: { name, availability, budget, vibes, hardNos: nos, tags: [], fromAreaId } } : cur));
    const fresh = await fetch(`/api/groups/${initial.code}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (fresh) setGroup(fresh as GroupPublic);
  }

  const answered = Boolean(stored && (me?.answer || !editing)) && !editing;
  const occasion = group.title || { friend_outing: "a night out", birthday: "a birthday", celebration: "a celebration", graduation: "a graduation" }[group.occasion];
  const deadline = new Date(group.deadline).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <main className="mx-auto w-full max-w-[560px] px-5 pb-16 pt-6">
      <div className="flex items-center justify-between gap-3">
        <Wordmark height={24} />
        {/* For anyone who has the app: open the same group there. The page works without it. */}
        <a
          className="rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--p-accent)]"
          href={`aduro://group/${initial.code}`}
        >
          Open in the app
        </a>
      </div>

      <h1 className="pl-up mt-8 text-[28px] font-bold leading-tight">
        {group.organiser} is planning {occasion}
      </h1>
      <p className="pl-up mt-2 text-[15.5px] leading-relaxed text-[var(--p-ink-2)]" style={{ animationDelay: "60ms" }}>
        {group.status === "locked"
          ? "The plan is set."
          : `Say when you're free and what you're into by ${deadline}. Duro finds a day and a plan that works for everyone.`}
      </p>
      {group.answered.length ? (
        <p className="mt-3 text-[14px] text-[var(--p-muted)]">
          In so far: {group.answered.join(", ")}
        </p>
      ) : null}

      {group.status === "locked" && group.locked ? (
        <section className="pl-up pl-card mt-6 p-5">
          <h2 className="text-[20px] font-bold">{group.locked.title}</h2>
          <p className="mt-1 text-[14px] text-[var(--p-muted)]">
            {dayLabel(group.locked.date)}, from {group.locked.startTime}
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            {group.locked.stops.map((s, i) => {
              const mine = me?.order?.stops[i];
              return (
                <li key={i} className="border-t border-[var(--p-line)] pt-3 first:border-0 first:pt-0">
                  <div className="text-[13px] font-bold uppercase tracking-wide text-[var(--p-accent)]">
                    {s.arrival_time} · {s.label}
                  </div>
                  <div className="text-[16px] font-semibold">{s.name}</div>
                  <div className="text-[13.5px] text-[var(--p-muted)]">{s.area}</div>
                  {mine && (mine.orders.length || mine.shared_ghs) ? (
                    <div className="mt-2 rounded-xl bg-[var(--p-accent-soft,#fdf1ea)] p-3 text-[14px]">
                      {mine.orders.map((o, k) => (
                        <div key={k} className="flex justify-between gap-3">
                          <span>{o.qty > 1 ? `${o.qty} × ` : ""}{o.item}</span>
                          <span>{ghs(o.price_ghs)}</span>
                        </div>
                      ))}
                      {mine.shared_ghs ? (
                        <div className="flex justify-between gap-3 text-[var(--p-muted)]">
                          <span>Your share of entry or booking</span>
                          <span>{ghs(mine.shared_ghs)}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {me?.order ? (
            <div className="mt-4 border-t border-[var(--p-line)] pt-3 text-[15px]">
              {me.order.rides_ghs ? (
                <div className="flex justify-between"><span>Your share of rides</span><span>{ghs(me.order.rides_ghs)}</span></div>
              ) : null}
              <div className="flex justify-between font-bold"><span>Your evening</span><span>{ghs(me.order.total_ghs)}</span></div>
              <p className="mt-1 text-[13px] text-[var(--p-muted)]">Within the {ghs(me.order.budget_ghs)} you set. Only you can see this.</p>
            </div>
          ) : stored ? null : (
            <p className="mt-4 text-[13.5px] text-[var(--p-muted)]">Answered from another phone? Your own order is there.</p>
          )}
          <a className="pl-btn mt-5 block w-full text-center" href={`/p/${group.locked.slug}`}>
            Open the plan
          </a>
        </section>
      ) : answered ? (
        <section className="pl-pop pl-card mt-6 p-6 text-center">
          <div className="text-[40px]">🙌</div>
          <h2 className="mt-1 text-[24px] font-bold">You&apos;re in</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--p-ink-2)]">
            When {group.organiser} locks the plan, come back to this page to see it, and your own order sized to your budget.
          </p>
          <button type="button" className="mt-4 text-[14px] font-bold text-[var(--p-accent)] underline" onClick={() => setEditing(true)}>
            Change my answer
          </button>
        </section>
      ) : (
        <form
          className="pl-up pl-card mt-6 flex flex-col gap-6 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="block">
            <span className="pl-label">What should the group call you?</span>
            <input className="pl-input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name or nickname" />
          </label>

          <div>
            <span className="pl-label">When can you make it?</span>
            <div className="flex flex-col gap-2">
              {dates.map((date) => (
                <div key={date} className="flex items-center justify-between gap-2">
                  <span className="w-28 text-[15px] font-semibold">{dayLabel(date)}</span>
                  <div className="flex gap-2">
                    {SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className="pl-chip"
                        aria-pressed={(availability[date] ?? []).includes(slot)}
                        onClick={() => toggleSlot(date, slot)}
                      >
                        {SLOT_LABEL[slot]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <span className="pl-label">How much do you want to spend? {ghs(budget)}</span>
            <input
              type="range"
              className="budget-slider"
              min={0}
              max={3000}
              step={50}
              value={Math.min(budget, 3000)}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
            <span className="pl-hint mt-1.5 block">
              Only you see this, not even {group.organiser}. Duro just makes sure the plan works for it, and sizes your own order to it.
            </span>
          </div>

          <div>
            <span className="pl-label">What are you into? Up to three</span>
            <div className="flex flex-wrap gap-2">
              {VIBES.filter((v) => v !== "Romantic").map((v) => (
                <button key={v} type="button" className="pl-chip" aria-pressed={vibes.includes(v)} onClick={() => setVibes((cur) => toggle(cur, v, 3))}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="pl-label">Anything you won&apos;t do?</span>
            <div className="flex flex-wrap gap-2">
              {HARD_NOS.map((h) => (
                <button key={h.id} type="button" className="pl-chip" aria-pressed={nos.includes(h.id)} onClick={() => setNos((cur) => toggle(cur, h.id))}>
                  {h.label}
                </button>
              ))}
            </div>
            <input
              className="pl-input mt-3"
              maxLength={120}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Anything else? e.g. no spicy food"
            />
          </div>

          <label className="block">
            <span className="pl-label">Where are you coming from?</span>
            <select className="pl-input" value={fromAreaId} onChange={(e) => setFromAreaId(e.target.value)}>
              <option value="">Not sure</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <input
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />

          {error ? (
            <div role="alert" className="text-[14px] font-semibold text-[var(--p-accent-dark)]">
              {error}
            </div>
          ) : null}
          <button type="submit" className="pl-btn w-full" disabled={busy}>
            {busy ? "Sending…" : stored ? "Update my answer" : "Count me in"}
          </button>
        </form>
      )}

      <div className="mt-8 text-center">
        <a className="text-[14px] font-bold text-[var(--p-accent)] underline" href={appStore} target="_blank" rel="noopener">
          Don&apos;t have Duro? Get the app
        </a>
      </div>
    </main>
  );
}
