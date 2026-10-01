"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./NamePoll.module.css";
import { NAME_OPTIONS, POLL_CLOSES_AT, colorsFor, nameKey, type Choice, type PollResults } from "@/lib/namePoll";
import { APP_STORE_URL } from "@/lib/links";
import { FlipText } from "@/components/fx/FlipText";
import { GetTheApp } from "@/components/fx/GetTheApp";
import { confetti, inkOn, useReducedMotion } from "@/components/fx/motion";

const STORE = "aduro-name-poll-v1";
/** The name as it was while the vote was open, in its own colours. */
const TODAY = { name: "aduro", c1: "#E23D6D", c2: "#E5B04E" };
/** What the vote chose. Once voting is over the page wears it, and says so. */
const WINNER = NAME_OPTIONS.find((o) => o.id === "Duro!")!;

type Results = PollResults;

type Particle = { id: number; x: number; y: number; dx: number; dy: number; rot: number; color: string };

/** Numbers that count up to where they are going. */
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return (
    <>
      {n}
      {suffix}
    </>
  );
}

/**
 * The time left to vote, each digit flipping as it changes. Drawn only once
 * mounted: the server's clock and the phone's would disagree on the seconds.
 */
function Countdown({ now }: { now: number | null }) {
  const left = now == null ? null : Math.max(0, POLL_CLOSES_AT - now);
  const parts = left == null
    ? null
    : [
        { label: "hours", v: Math.floor(left / 3_600_000) },
        { label: "mins", v: Math.floor(left / 60_000) % 60 },
        { label: "secs", v: Math.floor(left / 1000) % 60 },
      ];
  const urgent = left != null && left < 3_600_000;

  return (
    <div className={`${s.countdown} ${urgent ? s.urgent : ""} mt-6 inline-flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[22px] border border-white/10 px-5 py-4`}>
      <div>
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-white/60">
          <span className={s.liveDot} />
          Voting closes in
        </div>
        <div className="mt-1 text-[13px] text-white/50">Thursday 1 October, 12 noon</div>
      </div>
      <div className="flex items-start gap-2" role="timer" aria-live="off">
        {(parts ?? [{ label: "hours", v: -1 }, { label: "mins", v: -1 }, { label: "secs", v: -1 }]).map((p, k) => {
          const text = p.v < 0 ? "--" : String(p.v).padStart(2, "0");
          return (
            <div key={p.label} className="flex items-start gap-2">
              {k ? <span className="pt-1 text-[26px] font-extrabold text-white/40">:</span> : null}
              <div className="text-center">
                <div className="flex gap-1">
                  {[...text].map((d, i) => (
                    <span key={`${i}-${d}`} className={`${s.digit} grid h-[46px] w-[34px] place-items-center rounded-[10px] text-[28px] font-extrabold tabular-nums`}>
                      {d}
                    </span>
                  ))}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{p.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The name poll: the Google Form's two questions, with the name tried on as
 * it is picked. The logo in the nav, the colours of the page, an app icon
 * and a notification on a phone all become the chosen name, so voting is
 * choosing what the app would feel like rather than reading a list.
 */
export function NamePoll({ initialClosed = false }: { initialClosed?: boolean }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [other, setOther] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [phase, setPhase] = useState<"vote" | "sending" | "done">("vote");
  const [results, setResults] = useState<Results | null>(null);
  const [mine, setMine] = useState<{ choice: Choice; other?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [grown, setGrown] = useState(false);
  const [copied, setCopied] = useState(false);
  // True when the name was picked from the suggestions rather than typed.
  const [fromList, setFromList] = useState(false);
  const [suggested, setSuggested] = useState<{ name: string; votes: number }[]>([]);
  const otherRef = useRef<HTMLInputElement>(null);
  const pid = useRef(0);
  const reduced = useReducedMotion();
  // The clock, ticking once a second; null until mounted.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Known on the server when the page is built after the close, so the
  // announcement is there from the first paint instead of the old form.
  const closed = now != null ? now >= POLL_CLOSES_AT : initialClosed;

  const opt = closed ? WINNER : NAME_OPTIONS.find((o) => o.id === (phase === "done" ? mine?.choice ?? choice : choice));
  const typed = (phase === "done" ? mine?.other ?? other : other).trim().slice(0, 16);
  const shown = opt ? (opt.id === "Other" ? typed || "your idea" : opt.id) : TODAY.name;
  // A suggested name wears its own colours, the same ones every time.
  const custom = opt?.id === "Other" && typed ? colorsFor(typed) : null;
  const c1 = custom?.[0] ?? opt?.color ?? TODAY.c1;
  const c2 = custom?.[1] ?? opt?.color2 ?? TODAY.c2;
  const buttonInk = inkOn(c1, c2);

  const loadResults = useCallback(async () => {
    try {
      const res = await fetch("/api/poll", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as Results;
        setResults(data);
        setSuggested(data.suggested ?? []);
      }
    } catch {
      /* results are a bonus */
    }
  }, []);

  // Somebody who has voted on this device sees the results, not the form again.
  useEffect(() => {
    // "?pick=Outy" opens with a name already tried on, for sharing one.
    const wanted = new URLSearchParams(window.location.search).get("pick")?.toLowerCase().replace(/!/g, "");
    const preset = NAME_OPTIONS.find((o) => o.id.toLowerCase().replace(/!/g, "") === wanted && o.id !== "Other");
    if (preset) setChoice(preset.id);
    // The names others have suggested, so they can be voted for too.
    fetch("/api/poll", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Results | null) => d && setSuggested(d.suggested ?? []))
      .catch(() => undefined);
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) {
        const v = JSON.parse(saved);
        setMine(v);
        setChoice(v.choice);
        setOther(v.other ?? "");
        setPhase("done");
        void loadResults();
      }
    } catch {
      /* private mode: vote as new */
    }
  }, [loadResults]);

  // At noon the form gives way to the final count, for voters and everyone else.
  useEffect(() => {
    if (closed && !results) void loadResults();
  }, [closed, results, loadResults]);

  useEffect(() => {
    if ((phase !== "done" && !closed) || !results) return;
    const t = setTimeout(() => setGrown(true), 120);
    return () => clearTimeout(t);
  }, [phase, results, closed]);

  const burst = useCallback(
    (x: number, y: number, colors: string[]) => {
      if (reduced) return;
      const made: Particle[] = Array.from({ length: 18 }, () => {
        const a = Math.random() * Math.PI * 2;
        const d = 60 + Math.random() * 110;
        return {
          id: pid.current++,
          x,
          y,
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d,
          rot: (Math.random() - 0.5) * 540,
          color: colors[Math.floor(Math.random() * colors.length)],
        };
      });
      setParticles((cur) => [...cur, ...made]);
      setTimeout(() => setParticles((cur) => cur.filter((p) => !made.includes(p))), 900);
    },
    [reduced]
  );

  const pick = useCallback(
    (id: Choice, at?: { x: number; y: number }) => {
      if (phase !== "vote") return;
      setChoice(id);
      setError(null);
      if (id === "Other" && fromList) {
        setFromList(false);
        setOther("");
      }
      const o = NAME_OPTIONS.find((n) => n.id === id)!;
      if (at) burst(at.x, at.y, [o.color, o.color2, "#ffffff"]);
      if (id === "Other") setTimeout(() => otherRef.current?.focus(), 80);
    },
    [phase, burst, fromList]
  );

  /** Vote for a name somebody else suggested: it is an "Other" vote with their spelling. */
  const pickSuggested = useCallback(
    (name: string, at?: { x: number; y: number }) => {
      if (phase !== "vote") return;
      setChoice("Other");
      setOther(name);
      setFromList(true);
      setError(null);
      const [a, b] = colorsFor(name);
      if (at) burst(at.x, at.y, [a, b, "#ffffff"]);
    },
    [phase, burst]
  );

  // 1 to 5 picks an option, when the cursor is not in a text box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < NAME_OPTIONS.length) {
        const el = document.getElementById(`opt-${i}`);
        const r = el?.getBoundingClientRect();
        pick(NAME_OPTIONS[i].id, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick]);

  function tilt(e: React.MouseEvent<HTMLButtonElement>) {
    if (reduced) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`);
    el.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 12}deg`);
  }
  function untilt(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  }

  async function submit() {
    if (!choice) {
      setError("Pick a name first.");
      setShake((n) => n + 1);
      return;
    }
    if (choice === "Other" && !other.trim()) {
      setError("Type the name you have in mind.");
      setShake((n) => n + 1);
      otherRef.current?.focus();
      return;
    }
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choice,
          other: choice === "Other" ? other.trim() : undefined,
          suggestion: suggestion.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 429) {
        setError(data.error ?? "Could not save your vote.");
        setPhase("vote");
        return;
      }
      const v = { choice, other: choice === "Other" ? other.trim() : undefined };
      try {
        localStorage.setItem(STORE, JSON.stringify(v));
      } catch {
        /* fine */
      }
      // The server may have counted a typed "duro" as Duro!; show what it counted.
      const counted = data.counted as { choice: Choice; other: string | null } | undefined;
      const v2 = counted ? { choice: counted.choice, other: counted.other ?? undefined } : v;
      try {
        localStorage.setItem(STORE, JSON.stringify(v2));
      } catch {
        /* fine */
      }
      setMine(v2);
      setResults({ counts: data.counts ?? {}, suggested: data.suggested ?? [], total: data.total ?? 0 });
      setPhase("done");
      if (!reduced) confetti([c1, c2, "#ffffff", "#FFD166"]);
    } catch {
      setError("Could not reach us. Check your connection and try again.");
      setPhase("vote");
    }
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: closed ? "Aduro is now Duro!" : "Help rename aduro", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* dismissed */
    }
  }

  const initial = shown.replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase() || "?";
  /*
   * The results as one list: the four names from the form and every name
   * voters suggested, each with its own votes, most first. Only the top ten
   * are drawn, with the rest of the suggestions rolled into one line.
   */
  const rows = (() => {
    if (!results) return [];
    const fixed = NAME_OPTIONS.filter((o) => o.id !== "Other").map((o) => ({
      key: nameKey(o.id),
      label: `${o.emoji} ${o.id}`,
      n: results.counts[o.id] ?? 0,
      c1: o.color,
      c2: o.color2,
    }));
    const extra = (results.suggested ?? []).map((sg) => {
      const [a, b] = colorsFor(sg.name);
      return { key: nameKey(sg.name), label: `💡 ${sg.name}`, n: sg.votes, c1: a, c2: b };
    });
    const all = [...fixed, ...extra].sort((a, b) => b.n - a.n);
    const top = all.slice(0, 10);
    const rest = all.slice(10).reduce((t, r) => t + r.n, 0);
    return rest ? [...top, { key: "rest", label: "💡 Other suggestions", n: rest, c1: "#F472B6", c2: "#60A5FA" }] : top;
  })();
  const myKey = mine ? nameKey(mine.choice === "Other" ? mine.other ?? "" : mine.choice) : "";

  return (
    <div className={s.stage} style={{ ["--c1" as string]: c1, ["--c2" as string]: c2 }}>
      <div className={`${s.blob} ${s.blobA}`} style={{ backgroundColor: c1 }} />
      <div className={`${s.blob} ${s.blobB}`} style={{ backgroundColor: c2 }} />
      <div className={`${s.blob} ${s.blobC}`} style={{ backgroundColor: c1 }} />
      <div className={s.grain} />

      {particles.map((p) => (
        <span
          key={p.id}
          className={s.particle}
          style={{
            left: p.x,
            top: p.y,
            background: p.color,
            ["--dx" as string]: `${p.dx}px`,
            ["--dy" as string]: `${p.dy}px`,
            ["--rot" as string]: `${p.rot}deg`,
          }}
        />
      ))}

      <div className={s.content}>
        {/* The nav, whose logo becomes the name being tried on. */}
        <header className={s.nav}>
          <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5">
            {/* Clipped rather than pushed: a long typed name must not shove "Get the app" off a phone. */}
            <a href="/" className="flex h-full min-w-0 items-center gap-3 overflow-hidden pr-3" aria-label="Home">
              <span key={shown} className={s.tile} style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                {opt?.id === "Other" && !typed ? "?" : initial}
              </span>
              <FlipText name={shown} />
            </a>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-semibold text-white/80 md:inline">
                {closed ? "The vote is in" : phase === "done" ? "Thanks for voting" : "Name poll · live"}
              </span>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener"
                className={`${s.submit} shrink-0 rounded-full px-3.5 py-2 text-[12px] font-extrabold sm:px-4 sm:text-[13px]`}
                style={{ color: buttonInk }}
              >
                Get the app
              </a>
            </div>
          </div>
          {/* On a phone the full countdown is a long scroll down, so the time left rides in the bar. */}
          {now != null && !closed ? (
            <div className="flex items-center justify-center gap-2 border-t border-white/5 py-1.5 text-[12px] font-semibold text-white/75 md:hidden">
              <span className={s.liveDot} />
              Voting closes in{" "}
              <b className="font-mono text-white">
                {(() => {
                  const left = Math.max(0, POLL_CLOSES_AT - now);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  return `${pad(Math.floor(left / 3_600_000))}:${pad(Math.floor(left / 60_000) % 60)}:${pad(Math.floor(left / 1000) % 60)}`;
                })()}
              </b>
            </div>
          ) : null}
        </header>

        <main className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 px-4 pb-24 pt-8 sm:px-5 md:grid-cols-[minmax(0,1fr)_330px] md:gap-14 md:pt-16">
          <section className="min-w-0">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/60">{closed ? "The name change" : "Aduro name change"}</p>
            <h1 className="mt-3 break-words text-[34px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[44px] md:text-[56px]">
              {closed ? "Aduro is now Duro!" : "Aduro is getting renamed."}
              <br />
              <span className={s.shimmer}>{closed ? "You named it. Thank you :)" : "Be part of the change :)"}</span>
            </h1>
            <p className="mt-4 max-w-[560px] text-[16px] text-white/70">
              {closed
                ? "Same app, same plans, same account, and a new name: the one the vote chose. Here is how it ended."
                : "Tap a name to try it on. Watch the logo up there, and the phone, become it."}
            </p>

            {closed ? null : <Countdown now={now} />}

            {phase !== "done" && !closed ? (
              <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md md:p-7">
                <h2 className="text-[18px] font-bold">
                  What should be Aduro&apos;s new name? <span style={{ color: c1 }}>*</span>
                </h2>
                <div
                  key={shake}
                  role="radiogroup"
                  aria-label="New name"
                  className={`mt-4 grid gap-3 sm:grid-cols-2 ${shake ? s.shake : ""}`}
                  onKeyDown={(e) => {
                    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) return;
                    e.preventDefault();
                    const at = Math.max(0, NAME_OPTIONS.findIndex((o) => o.id === choice));
                    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
                    const i = (at + step + NAME_OPTIONS.length) % NAME_OPTIONS.length;
                    pick(NAME_OPTIONS[i].id);
                    document.getElementById(`opt-${i}`)?.focus();
                  }}
                >
                  {NAME_OPTIONS.map((o, i) => {
                    const on = choice === o.id && !(o.id === "Other" && fromList);
                    return (
                      <button
                        key={o.id}
                        id={`opt-${i}`}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on || (!choice && i === 0) ? 0 : -1}
                        onMouseMove={tilt}
                        onMouseLeave={untilt}
                        onClick={(e) => pick(o.id, { x: e.clientX || e.currentTarget.getBoundingClientRect().left + 40, y: e.clientY || e.currentTarget.getBoundingClientRect().top + 30 })}
                        className={`${s.option} ${on ? s.optionOn : ""} flex items-center gap-4 rounded-[20px] border px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                          on ? "border-transparent bg-white/[0.09]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                        } ${o.id === "Other" ? "sm:col-span-2" : ""}`}
                        style={{ ["--c1" as string]: o.color, ["--c2" as string]: o.color2 }}
                      >
                        <span
                          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[24px]"
                          style={{ background: `linear-gradient(135deg, ${o.color}33, ${o.color2}33)` }}
                        >
                          <span className={s.optionEmoji}>{o.emoji}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[21px] font-extrabold tracking-[-0.01em]">{o.id === "Other" ? "Other" : o.id}</span>
                          <span className="block text-[13px] text-white/60">{o.line}</span>
                        </span>
                        <span className="hidden rounded-md border border-white/15 px-1.5 text-[11px] font-bold text-white/50 sm:inline">{i + 1}</span>
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2"
                          style={{ borderColor: on ? o.color : "rgba(255,255,255,0.25)", background: on ? o.color : "transparent" }}
                        >
                          {on ? (
                            <svg key={o.id} className={s.check} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/*
                  Names other voters typed, each already carrying their vote.
                  Picking one is a vote for it; the counts wait until after
                  voting, so the list does not steer anybody.
                */}
                {suggested.length ? (
                  <div className="mt-6">
                    <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-white/55">Suggested by other voters</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {suggested.slice(0, 16).map((sg) => {
                        const [a, b] = colorsFor(sg.name);
                        const on = fromList && choice === "Other" && nameKey(other) === nameKey(sg.name);
                        return (
                          <button
                            key={sg.name}
                            type="button"
                            onClick={(e) => pickSuggested(sg.name, { x: e.clientX, y: e.clientY })}
                            aria-pressed={on}
                            className={`${s.option} ${on ? s.optionOn : ""} flex items-center gap-2 rounded-full border px-4 py-2 text-[15px] font-bold ${
                              on ? "border-transparent bg-white/[0.12]" : "border-white/12 bg-white/[0.04] hover:bg-white/[0.08]"
                            }`}
                            style={{ ["--c1" as string]: a, ["--c2" as string]: b }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
                            {sg.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {choice === "Other" && !fromList ? (
                  <div className={`${s.expand} mt-3 overflow-hidden`}>
                    <input
                      ref={otherRef}
                      value={other}
                      maxLength={40}
                      onChange={(e) => setOther(e.target.value)}
                      placeholder="Type your name idea, it tries itself on as you type"
                      className="h-[54px] w-full rounded-[16px] border border-white/15 bg-black/30 px-4 text-[17px] font-semibold text-white placeholder:font-normal placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                ) : null}

                <h2 className="mt-8 text-[18px] font-bold">Any suggestions for the app?</h2>
                <div className="relative mt-3">
                  <textarea
                    value={suggestion}
                    maxLength={1000}
                    onChange={(e) => setSuggestion(e.target.value)}
                    placeholder="Anything you'd love aduro to do, or do better"
                    className="min-h-[120px] w-full resize-y rounded-[16px] border border-white/15 bg-black/30 px-4 py-3 text-[16px] text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  />
                  <span className="pointer-events-none absolute bottom-3 right-4 text-[12px] text-white/40">{suggestion.length}/1000</span>
                </div>

                {error ? (
                  <p className="mt-4 text-[14px] font-semibold" style={{ color: c2 }} role="alert">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={phase === "sending"}
                  className={`${s.submit} mt-6 h-[58px] w-full rounded-[18px] text-[18px] font-extrabold disabled:opacity-70`}
                  style={{ color: buttonInk }}
                >
                  {phase === "sending" ? "Counting you in…" : choice ? `Vote for ${shown}` : "Cast my vote"}
                </button>
              </div>
            ) : (
              /* ── after voting: the results, counting up ── */
              <div className={`${s.rise} mt-8 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md md:p-7`}>
                <div className="text-[34px]">{closed ? "🔥" : "🎉"}</div>
                <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.01em]">{closed ? "The final count" : "Thank you!"}</h2>
                <p className="mt-1 text-[15px] text-white/70">
                  {mine ? (
                    <>
                      You picked <b style={{ color: c1 }}>{mine.choice === "Other" ? mine.other : mine.choice}</b>.{" "}
                      {closed ? "Voting closed at noon on 1 October." : "Here is how the vote is going."}
                    </>
                  ) : (
                    "Voting closed at noon on 1 October. Thank you to everybody who voted."
                  )}
                </p>

                <div className="mt-6 grid gap-4">
                  {results ? (
                    rows.map((o, i) => {
                      const n = o.n;
                      const p = results.total ? Math.round((100 * n) / results.total) : 0;
                      const yours = o.key === myKey;
                      return (
                        <div key={o.key} className={s.rise} style={{ animationDelay: `${120 + i * 90}ms`, ["--c1" as string]: o.c1, ["--c2" as string]: o.c2 }}>
                          <div className="mb-1.5 flex items-baseline justify-between text-[15px]">
                            <span className="font-bold">
                              {o.label}
                              {yours ? <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold">your vote</span> : null}
                            </span>
                            <span className="font-mono text-white/70">
                              <CountUp to={p} suffix="%" />
                            </span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-white/10">
                            <div className={s.bar} style={{ width: grown ? `${Math.max(p, n ? 3 : 0)}%` : "0%" }} />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[14px] text-white/60">Loading the results…</p>
                  )}
                </div>
                {results ? (
                  <p className="mt-4 text-[13px] text-white/50">
                    <CountUp to={results.total} /> {results.total === 1 ? "vote" : "votes"} {closed ? "in all" : "so far"}.
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void share()}
                  className={`${s.submit} mt-6 h-[54px] w-full rounded-[18px] text-[17px] font-extrabold`}
                  style={{ color: buttonInk }}
                >
                  {copied ? "Link copied" : closed ? "Share the news" : "Send the poll to a friend"}
                </button>
              </div>
            )}

            <GetTheApp reduced={reduced} ink={buttonInk} eyebrow={closed ? undefined : "Still aduro, for now"} className="mt-6" />
          </section>

          {/* ── the name, tried on ── */}
          <aside className="order-first min-w-0 md:order-last">
            <div className="md:sticky md:top-24">
              <div className="flex flex-col items-center">
                <div key={`name-${shown}`} className={`${s.bounceIn} mb-6 text-center`}>
                  <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/50">{closed ? "Now called" : "Trying on"}</div>
                  <div className={`${s.shimmer} text-[46px] font-extrabold leading-tight tracking-[-0.02em]`}>{shown}</div>
                  <div className="text-[14px] text-white/60">{opt?.line ?? "Pick a name to see it on the app."}</div>
                </div>

                {/* Scaled on small screens, and the space the scale frees taken back. */}
                <div className="-mb-[76px] origin-top scale-[0.86] md:mb-0 md:scale-100">
                  <div className={s.phone}>
                    <div className={s.screen}>
                      <div className={s.notch} />
                      <div className="absolute left-0 right-0 top-2 flex justify-between px-7 text-[12px] font-semibold text-white">
                        <span>9:41</span>
                        <span>●●● ▮</span>
                      </div>

                      <div key={`note-${shown}`} className={s.notification}>
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-black/60">
                          {closed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src="/duro-icon.png" alt="" width={16} height={16} className="h-4 w-4 rounded-[5px]" />
                          ) : (
                            <span className="grid h-4 w-4 place-items-center rounded-[5px] text-[9px] font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                              {initial}
                            </span>
                          )}
                          <span className="uppercase tracking-wide">{shown}</span>
                          <span className="ml-auto">now</span>
                        </div>
                        <div className="mt-1 text-[13px] font-bold">Your Saturday plan is ready 🎉</div>
                        <div className="text-[12px] text-black/70">3 stops in Osu, GHS 640 for two.</div>
                      </div>

                      <div className="absolute inset-x-0 top-[150px] grid grid-cols-4 gap-y-5 px-5">
                        {Array.from({ length: 11 }, (_, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <div className="h-11 w-11 rounded-[12px] bg-white/15" />
                            <div className="h-1.5 w-8 rounded bg-white/15" />
                          </div>
                        ))}
                        <div className="flex flex-col items-center gap-1">
                          {/* Once the name is settled, the real icon rather than a letter. */}
                          {closed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key="icon-final"
                              src="/duro-icon.png"
                              alt=""
                              width={44}
                              height={44}
                              className={`${s.appIcon} h-11 w-11 rounded-[12px] shadow-lg`}
                            />
                          ) : (
                            <div
                              key={`icon-${shown}`}
                              className={`${s.appIcon} grid h-11 w-11 place-items-center rounded-[12px] text-[20px] font-extrabold text-white shadow-lg`}
                              style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                            >
                              {opt?.id === "Other" && !typed ? "?" : initial}
                            </div>
                          )}
                          <div className="max-w-[60px] truncate text-[10px] font-semibold text-white">{shown}</div>
                        </div>
                      </div>

                      <div className="absolute inset-x-3 bottom-3 flex justify-around rounded-[22px] bg-white/15 p-2.5 backdrop-blur">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="h-10 w-10 rounded-[11px] bg-white/20" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
