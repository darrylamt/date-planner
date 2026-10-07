"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconCheck, IconSparkle } from "@/components/planner/icons";

const SUPPORT_EMAIL = "planbyaduro@gmail.com";

const TOPICS = ["Bookings", "Menu or prices", "Photos or details", "Hours", "Signing in", "Something else"];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Why am I not showing up in plans?",
    a: "Most often there are no prices on your menu: every plan has a budget, so a place without prices is left out rather than shown as free. Also check that you're switched on (Home), and that your hours cover the evening being planned.",
  },
  {
    q: "How do bookings reach me?",
    a: "People ask for a table from their plan, on whatever you list under Your place: your booking page, WhatsApp, or a call. Requests sent through Duro also show on Home, where you can mark them confirmed for your own record.",
  },
  {
    q: "My menu is long. Do I have to type it all?",
    a: "No. Send a photo or PDF of it to us and we'll put it on for you. After that, change prices here whenever they change.",
  },
  {
    q: "We're closed for a few days. What do I do?",
    a: "Switch off \"Showing in plans\" on Home. Nobody is sent to you until you switch it back on, and everything else is kept. For a single day, set that day to closed under Opening hours.",
  },
  {
    q: "We have more than one branch.",
    a: "One login can run them all. Tap the branch name at the top of any page to switch. A shared menu is changed for every branch at once, unless you add a dish to one branch only.",
  },
  {
    q: "When do changes go live?",
    a: "Straight away. Plans people already saved keep the version they saved.",
  },
];

/** Answers first, then a message to a person, then how else to reach us. */
export function VenueHelp({ who, tourHref }: { who: string; tourHref: string }) {
  const router = useRouter();
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
          context: { screen: `venue: ${who}`.slice(0, 60), platform: "web" },
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

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/venue/login");
    router.refresh();
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
            <div className="mt-3 text-[16px] font-bold">Sent. We&apos;ll get back to you.</div>
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
            <textarea className="pl-input" value={message} maxLength={2000} placeholder="What happened, and what you were trying to do." onChange={(e) => setMessage(e.target.value)} />
            {error ? <p className="text-[14px] font-semibold text-[var(--p-accent-dark)]">{error}</p> : null}
            <button type="button" className="pl-btn" disabled={busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        )}
        <p className="mt-4 text-[13.5px] text-[var(--p-muted)]">
          Or email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Duro venue: ${who}`)}`} className="font-bold text-[var(--p-accent)] underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <div className="pl-up flex flex-col gap-3" style={{ animationDelay: "160ms" }}>
        <Link href={tourHref} className="pl-btn-ghost w-full">
          <IconSparkle size={18} /> Replay the welcome tour
        </Link>
        <button type="button" className="py-2 text-[15px] font-bold text-[#b42318]" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
