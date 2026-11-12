"use client";

import { useEffect, useState } from "react";
import { confetti } from "@/components/fx/motion";
import { storeLink } from "@/lib/links";

/**
 * "Are you in?" on a shared plan (0107, owner 12 Nov 2026).
 *
 * In thirty days shared plans were opened 31 times and nobody did anything
 * next, because the page asked nothing of the person it was sent to. An
 * invitation is answered: one tap says yes, the planner's phone is told, and
 * the answer is the first reason this person has to want the app (their own
 * copy of the plan, with a reminder on the day).
 *
 * The answer is kept in this browser too, so coming back shows what they
 * said and lets them change it. Their name is optional and goes only to the
 * person who made the plan.
 */
const VISITOR = "duro.rsvp.visitor";
const NAME = "duro.rsvp.name";

function visitorId(): string {
  try {
    const kept = localStorage.getItem(VISITOR);
    if (kept && /^[A-Za-z0-9_-]{12,64}$/.test(kept)) return kept;
    const made = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(VISITOR, made);
    return made;
  } catch {
    // Private windows: an id for this visit only.
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
}

export function PlanRsvp({ slug, colors, ink, day, reduced }: { slug: string; colors: [string, string]; ink: string; day: string; reduced: boolean }) {
  const [c1, c2] = colors;
  const [answer, setAnswer] = useState<"in" | "cant" | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"in" | "cant" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    try {
      const said = localStorage.getItem(`duro.rsvp.${slug}`);
      if (said === "in" || said === "cant") setAnswer(said);
      setName(localStorage.getItem(NAME) ?? "");
    } catch {
      /* nothing remembered */
    }
  }, [slug]);

  async function send(next: "in" | "cant") {
    if (busy) return;
    setBusy(next);
    setError(null);
    try {
      const res = await fetch("/api/plan-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, answer: next, name: name.trim() || undefined, note: note.trim() || undefined, visitor: visitorId() }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!json?.ok) {
        setError(json?.message ?? "That didn't send. Try again.");
        return;
      }
      setAnswer(next);
      setChanging(false);
      try {
        localStorage.setItem(`duro.rsvp.${slug}`, next);
        if (name.trim()) localStorage.setItem(NAME, name.trim());
      } catch {
        /* not remembered; the answer still went */
      }
      if (next === "in" && !reduced) confetti([c1, c2, "#ffffff", "#FFD166"], "top");
    } catch {
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const field = "h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-[15px] text-white placeholder:text-white/40 outline-none focus:border-white/40";

  if (answer && !changing) {
    return (
      <div className="mt-6 max-w-[460px] rounded-[22px] border border-white/10 bg-white/[0.05] p-5">
        <p className="text-[19px] font-extrabold leading-snug">{answer === "in" ? `You're in. See you ${day}.` : "Sorry you can't make it."}</p>
        <p className="mt-1.5 text-[14.5px] text-white/65">
          {answer === "in" ? "We've told the person who planned this." : "We've let the person who planned this know."}
        </p>
        {answer === "in" ? (
          <a
            href={storeLink("shared_plan")}
            className="mt-4 inline-flex h-11 items-center rounded-full px-5 text-[15px] font-bold"
            style={{ background: `linear-gradient(90deg, ${c1}, ${c2})`, color: ink }}
          >
            Get Duro! to plan the next one
          </a>
        ) : null}
        <button type="button" onClick={() => setChanging(true)} className="mt-3 block text-[13.5px] font-semibold text-white/55 underline-offset-2 hover:underline">
          Change my answer
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 max-w-[460px] rounded-[22px] border border-white/10 bg-white/[0.05] p-5">
      <p className="text-[19px] font-extrabold leading-snug">Are you in?</p>
      <p className="mt-1 text-[14.5px] text-white/65">One tap tells the person who planned this.</p>
      <div className="mt-4 grid gap-2.5">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Your name (optional)" aria-label="Your name" autoComplete="given-name" className={field} />
        <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Add a message (optional)" aria-label="A message" className={field} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void send("in")}
          disabled={busy != null}
          className="h-12 flex-1 rounded-full px-6 text-[16px] font-extrabold transition-opacity disabled:opacity-60"
          style={{ background: `linear-gradient(90deg, ${c1}, ${c2})`, color: ink }}
        >
          {busy === "in" ? "Sending…" : "I'm in"}
        </button>
        <button
          type="button"
          onClick={() => void send("cant")}
          disabled={busy != null}
          className="h-12 rounded-full border border-white/20 px-5 text-[15px] font-bold text-white/85 transition-opacity disabled:opacity-60"
        >
          {busy === "cant" ? "Sending…" : "Can't make it"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-[#FFB4A8]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
