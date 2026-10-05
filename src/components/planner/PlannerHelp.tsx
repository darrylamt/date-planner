"use client";

import { useState } from "react";
import Link from "next/link";
import { IconCheck, IconSparkle } from "./icons";

const SUPPORT_EMAIL = "planbyaduro@gmail.com";

const TOPICS = ["Putting a night on", "A place", "My logo or name", "Signing in", "Something else"];

const FAQ: { q: string; a: string }[] = [
  {
    q: "When does my night start showing up?",
    a: "As soon as you put it on. Plans are built for a date and a time, so anybody planning an evening that date, near your venue, while your night is on, can be offered it.",
  },
  {
    q: "Why isn't my night showing up in plans?",
    a: "The usual reasons: it has no entry price (choose Free if it is free), the plan's time does not overlap your start time, the price is more than the plan's budget, or the mood they asked for is far from the vibe you picked.",
  },
  {
    q: "It's on every Saturday. Do I add it every week?",
    a: "Put it on once and pick every date it runs, in the When step. Or tap Run again on a night that already happened: everything is filled in except the date.",
  },
  {
    q: "My venue isn't in the list.",
    a: "Use \"Not on Duro? Add the place\" in the Where step, or the Places tab. It goes live straight away. If it is a club or bar we should list, tell us and we will add it properly.",
  },
  {
    q: "Can I change a night after it's on?",
    a: "Yes. Tap Edit on it. Changes are live at once. Plans people already saved keep the version they saved.",
  },
  {
    q: "What does \"Ladies only\" do?",
    a: "It keeps the night out of plans for anybody it is not open to. Use it only when nobody else can come. Free entry for ladies is still Everyone.",
  },
];

/** Answers first, then a message to a person, then the way to reach us. */
export function PlannerHelp({ who }: { who: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!message.trim()) return setError("Tell us what happened first.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: topic === "Signing in" ? "account" : "other",
          message: `[${topic}] ${message.trim()}`,
          context: { screen: `planner: ${who}`.slice(0, 60), platform: "web" },
        }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
      setMessage("");
    } catch {
      setError("That did not send. Try again, or email us.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="pl-up">
        <h2 className="mb-3 text-[19px] font-bold">Common questions</h2>
        <div className="pl-card divide-y divide-[var(--p-line)]">
          {FAQ.map((f, i) => {
            const on = open === i;
            return (
              <div key={f.q}>
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setOpen(on ? null : i)}
                  className="pl-tap flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-[15.5px] font-bold"
                >
                  {f.q}
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--p-sunken)] text-[18px] leading-none transition-transform duration-300 ${on ? "rotate-45" : ""}`}>
                    +
                  </span>
                </button>
                <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: on ? "1fr" : "0fr" }}>
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 text-[15px] leading-relaxed text-[var(--p-ink-2)]">{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pl-card pl-up p-5" style={{ animationDelay: "80ms" }}>
        <h2 className="text-[19px] font-bold">Ask a person</h2>
        <p className="mt-1 text-[14.5px] text-[var(--p-muted)]">Something not working, or not sure how? A person reads every one.</p>

        {sent ? (
          <div className="pl-pop mt-5 flex flex-col items-center rounded-2xl bg-[var(--p-ok-soft)] px-5 py-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-ok)] text-white">
              <IconCheck size={24} />
            </span>
            <div className="mt-3 text-[16px] font-bold">Sent. We will get back to you.</div>
            <button type="button" className="mt-2 text-[14px] font-bold text-[var(--p-ok)] underline" onClick={() => setSent(false)}>
              Send another
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <button key={t} type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={topic === t} onClick={() => setTopic(t)}>
                  {t}
                </button>
              ))}
            </div>
            <textarea
              className="pl-input"
              value={message}
              maxLength={2000}
              placeholder="What happened, and which night or place it was about."
              onChange={(e) => setMessage(e.target.value)}
            />
            {error ? <p className="text-[14px] font-semibold text-[var(--p-accent-dark)]">{error}</p> : null}
            <button type="button" className="pl-btn" disabled={busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        )}
        <p className="mt-4 text-[13.5px] text-[var(--p-muted)]">
          Or email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Duro planner: ${who}`)}`} className="font-bold text-[var(--p-accent)] underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <Link href="/planner?tour=1" className="pl-btn-ghost pl-up w-full" style={{ animationDelay: "160ms" }}>
        <IconSparkle size={18} /> Replay the welcome tour
      </Link>
    </div>
  );
}
