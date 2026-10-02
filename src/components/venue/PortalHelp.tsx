"use client";

import { useState } from "react";

const SUPPORT_EMAIL = "planbyaduro@gmail.com";

const PLANNER_TOPICS = ["Adding a location", "Putting a night on", "My logo or details", "Signing in", "Something else"];
const VENUE_TOPICS = ["Bookings", "My listing or pictures", "Menu or prices", "Hours", "Signing in", "Something else"];

/** Answers to what people ask, before they have to ask. */
const PLANNER_FAQ: { q: string; a: string }[] = [
  {
    q: "When does my night start showing up in plans?",
    a: "As soon as it is saved, on its date. Plans are built for a day and a time, so somebody planning that evening, in or near your location's part of town, can be offered it.",
  },
  {
    q: "Why is my event not showing?",
    a: "Usually the date has passed, the start time falls outside the evening being planned, or the price at the door is more than the budget allows. If none of those fits, send us a message.",
  },
  {
    q: "Can I move a location to another part of town?",
    a: "Not from here, because the part of town decides which plans a place appears in. Send us a message and we will move it.",
  },
];
const VENUE_FAQ: { q: string; a: string }[] = [
  {
    q: "Why is my venue not in plans?",
    a: "Most often there is no price on file: a place with no menu or average cost is left out rather than shown as free. Add your menu or a price per person and it comes back.",
  },
  {
    q: "How do bookings reach me?",
    a: "People send a request from their plan, on the channel you list: your booking page, WhatsApp or a call. Requests through Duro show under Bookings.",
  },
];

/**
 * The form, the answers and the contact, for the portal's Help tab.
 * A report is anonymous to nobody: it carries the signed-in login, so the
 * admin can tell which planner or venue wrote in.
 */
export function PortalHelp({ who, planner }: { who: string; planner: boolean }) {
  const topics = planner ? PLANNER_TOPICS : VENUE_TOPICS;
  const [topic, setTopic] = useState(topics[0]);
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
          context: { screen: `portal: ${who}`.slice(0, 60), platform: "web" },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "That did not send. Try again, or email us.");
        return;
      }
      setSent(true);
      setMessage("");
    } catch {
      setError("Could not reach us. Check your connection, or email us.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="card p-5">
        <div className="text-[15px] font-bold">Tell us what is wrong</div>
        {sent ? (
          <div className="mt-3 text-[14px]">
            <div className="font-semibold">Thank you, that is with us.</div>
            <p className="mt-1 text-mutedbrown">We read every one and will get back to you. Anything urgent, email us too.</p>
            <button className="btn2 btnsm mt-3" onClick={() => setSent(false)}>
              Send another
            </button>
          </div>
        ) : (
          <>
            <label className="mt-3 flex flex-col">
              <span className="flbl">What is it about</span>
              <select className="inp" value={topic} onChange={(e) => setTopic(e.target.value)}>
                {topics.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex flex-col">
              <span className="flbl">What happened</span>
              <textarea
                className="inp min-h-[130px] py-2"
                maxLength={1800}
                value={message}
                placeholder="What you were doing, what you expected, and what happened instead."
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            {error ? <p className="mt-2 text-[13px] font-semibold text-staletext">{error}</p> : null}
            <button className="btn btnsm mt-4 px-6" disabled={busy} onClick={() => void send()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </>
        )}
      </div>

      <div className="grid content-start gap-5">
        <div className="card p-5 text-[14px]">
          <div className="text-[15px] font-bold">Reach a person</div>
          <p className="mt-1 text-mutedbrown">Email us and say who you are. We usually reply the same day.</p>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Duro portal: ${who}`)}`} className="mt-2 inline-block font-semibold text-flame underline">
            {SUPPORT_EMAIL}
          </a>
        </div>
        <div className="card p-5">
          <div className="text-[15px] font-bold">Common questions</div>
          <div className="mt-2 grid gap-2">
            {(planner ? PLANNER_FAQ : VENUE_FAQ).map((f) => (
              <details key={f.q} className="rounded-lg bg-cream/60 px-3 py-2 text-[13px]">
                <summary className="cursor-pointer font-semibold">{f.q}</summary>
                <p className="mt-1 text-mutedbrown">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
