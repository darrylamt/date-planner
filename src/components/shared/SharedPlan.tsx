"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import s from "./SharedPlan.module.css";
import { FlipText } from "@/components/fx/FlipText";
import { GetTheApp } from "@/components/fx/GetTheApp";
import { confetti, inkOn, useReducedMotion } from "@/components/fx/motion";
import { SmartImage } from "@/components/SmartImage";
import { storeLink } from "@/lib/links";
import { trackShare } from "@/lib/shareEvents";

export interface SharedStop {
  key: string;
  name: string;
  area: string;
  time: string;
  label: string;
  what: string;
  whatsOn: string[];
  /** What is on the order, without prices. */
  dishes: { item: string; qty: number }[];
  image: string | null;
  instagram: string | null;
  emoji: string;
}

export interface SharedPlanProps {
  eyebrow: string;
  motif: string;
  invitation: string;
  closing: string;
  weekday: string;
  dayMonth: string;
  route: string[];
  from: string;
  /** When the first stop starts and the last one ends, in ms; null when the date will not parse. */
  startsAt: number | null;
  endsAt: number | null;
  note: string | null;
  stops: SharedStop[];
  /** Minutes between stop i and i + 1. */
  hops: number[];
  colors: [string, string];
  page: string;
  glyphs: string[];
  entrance: "confetti" | "hearts" | "calm";
  /** The plan's share slug, to count what this page leads to (0070). */
  slug: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Time until the plan starts, each digit flipping as it changes. Drawn only
 * once mounted, since the server's clock and the phone's disagree on seconds.
 */
function StartsIn({ now, startsAt, endsAt }: { now: number | null; startsAt: number | null; endsAt: number | null }) {
  if (now == null || startsAt == null) return null;
  if (now >= startsAt) {
    if (endsAt != null && now < endsAt) {
      return (
        <div className={`${s.panel} mt-7 inline-flex items-center gap-3 rounded-[22px] px-5 py-4 text-[16px] font-bold`}>
          <span className={s.liveDot} /> Happening right now
        </div>
      );
    }
    return null;
  }
  const left = startsAt - now;
  const days = Math.floor(left / 86_400_000);
  const parts = [
    ...(days ? [{ label: days === 1 ? "day" : "days", v: String(days) }] : []),
    { label: "hours", v: pad(Math.floor(left / 3_600_000) % 24) },
    { label: "mins", v: pad(Math.floor(left / 60_000) % 60) },
    { label: "secs", v: pad(Math.floor(left / 1000) % 60) },
  ];
  return (
    <div className={`${s.panel} mt-7 inline-flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[22px] px-5 py-4`}>
      <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/60">Starts in</div>
      <div className="flex items-start gap-2" role="timer" aria-live="off">
        {parts.map((p, k) => (
          <div key={p.label} className="flex items-start gap-2">
            {k ? <span className="pt-1 text-[24px] font-extrabold text-white/35">:</span> : null}
            <div className="text-center">
              <div className="flex gap-1">
                {[...p.v].map((d, i) => (
                  <span key={`${i}-${d}`} className={`${s.digit} grid h-[42px] w-[31px] place-items-center rounded-[10px] text-[25px] font-extrabold tabular-nums`}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{p.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The sender's note, typed out as if it were being written. */
function Note({ text, reduced }: { text: string; reduced: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) {
      setN(text.length);
      return;
    }
    const step = Math.max(14, Math.min(45, 1600 / text.length));
    let t: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      t = setInterval(() => setN((c) => (c >= text.length ? (clearInterval(t), c) : c + 1)), step);
    }, 900);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, [text, reduced]);
  const done = n >= text.length;

  return (
    <div className={`${s.note} mt-7 max-w-[460px] rounded-[22px] px-5 py-4`}>
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--c1)" }}>
        <span className={s.envelope}>✉️</span> A note for you
      </div>
      {/* The whole note for screen readers at once; the typing is for eyes. */}
      <p className="sr-only">{text}</p>
      <p aria-hidden className="mt-2 min-h-[1.6em] whitespace-pre-line text-[17px] leading-relaxed text-white/90">
        {text.slice(0, n)}
        {done ? null : <span className={s.caret}>|</span>}
      </p>
    </div>
  );
}

/**
 * A shared plan, dressed the way the name poll is: the occasion's colours
 * drifting behind, the date flipping in letter by letter, the stops rising
 * down a line that draws itself, and a countdown to the evening. It is the
 * guest's copy, so it carries no prices; the person who made the plan sees
 * every figure in their own app.
 */
export function SharedPlan(p: SharedPlanProps) {
  const [c1, c2] = p.colors;
  const ink = inkOn(c1, c2);
  const reduced = useReducedMotion();
  const [now, setNow] = useState<number | null>(null);
  const [hearts, setHearts] = useState<{ id: number; left: number; delay: number; size: number }[]>([]);
  const played = useRef(false);

  // Opened in a browser, which a link preview fetching the page is not.
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    trackShare("view", "shared_plan", p.slug);
  }, [p.slug]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // The entrance, once: paper for a birthday, hearts for a date, nothing for a meeting.
  useEffect(() => {
    if (reduced || played.current) return;
    played.current = true;
    const t = setTimeout(() => {
      if (p.entrance === "confetti") confetti([c1, c2, "#ffffff", "#FFD166"], "top");
      if (p.entrance === "hearts") {
        setHearts(
          Array.from({ length: 22 }, (_, i) => ({ id: i, left: Math.random() * 100, delay: Math.random() * 1400, size: 16 + Math.random() * 22 }))
        );
        setTimeout(() => setHearts([]), 4200);
      }
    }, 650);
    return () => clearTimeout(t);
  }, [reduced, p.entrance, c1, c2]);

  function tilt(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`);
    el.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 8}deg`);
  }
  function untilt(e: React.MouseEvent<HTMLDivElement>) {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  }

  return (
    <div className={s.stage} style={{ ["--c1" as string]: c1, ["--c2" as string]: c2, backgroundColor: p.page }}>
      <div className={`${s.blob} ${s.blobA}`} style={{ backgroundColor: c1 }} />
      <div className={`${s.blob} ${s.blobB}`} style={{ backgroundColor: c2 }} />
      <div className={`${s.blob} ${s.blobC}`} style={{ backgroundColor: c1 }} />
      <div className={s.grain} />

      {/* The occasion's glyphs, drifting up like bubbles. Placed by index, so server and phone agree. */}
      <div aria-hidden className={s.floaters}>
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className={s.floater}
            style={{
              left: `${(i * 37 + 7) % 100}%`,
              fontSize: 14 + (i % 3) * 9,
              animationDuration: `${14 + (i % 5) * 3}s`,
              animationDelay: `${-i * 2.3}s`,
            }}
          >
            {p.glyphs[i % p.glyphs.length]}
          </span>
        ))}
      </div>

      {hearts.map((h) => (
        <span key={h.id} aria-hidden className={s.heartUp} style={{ left: `${h.left}%`, animationDelay: `${h.delay}ms`, fontSize: h.size, color: h.id % 2 ? c1 : c2 }}>
          ♥
        </span>
      ))}

      <div className={s.content}>
        <header className={s.nav}>
          <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5">
            <Link href="/" className="flex h-full min-w-0 items-center gap-3 overflow-hidden pr-3" aria-label="Duro!">
              <span className={s.tile} style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, color: ink }}>
                D
              </span>
              <FlipText name="Duro!" />
            </Link>
            <Link
              href={`/get?from=plan&p=${p.slug}`}
              onClick={() => trackShare("plan_your_own", "shared_plan", p.slug)}
              className={`${s.pill} shrink-0 rounded-full px-4 py-2 text-[13px] font-extrabold`}
              style={{ color: ink }}
            >
              Plan your own
            </Link>
          </div>
        </header>

        <main className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 px-4 pb-20 pt-10 sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(0,500px)] md:gap-16 md:pt-16">
          {/* ── the occasion ── */}
          <section className="min-w-0">
            <div className="md:sticky md:top-28">
              <div className={`${s.motif} text-[44px] leading-none`} aria-hidden>
                {p.motif}
              </div>
              <p className={`${s.shimmer} mt-4 text-[13px] font-extrabold tracking-[0.2em]`}>{p.eyebrow}</p>
              <h1 className="mt-3 text-[44px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[56px] md:text-[68px]">
                <span className="sr-only">
                  {p.weekday} {p.dayMonth}
                </span>
                <span aria-hidden className="block">
                  <FlipText name={p.weekday} className={s.big} accent="none" delay={120} />
                </span>
                <span aria-hidden className="block">
                  <FlipText name={p.dayMonth} className={s.big} accent="whole" delay={420} />
                </span>
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                {p.route.map((area, i) => (
                  // The arrow after each area rather than before, so a wrapped line ends on one instead of starting with it.
                  <span key={`${area}-${i}`} className="flex items-center gap-2">
                    <span className={`${s.rise} rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5`} style={{ animationDelay: `${740 + i * 140}ms` }}>
                      {area}
                    </span>
                    {i < p.route.length - 1 ? (
                      <span className={`${s.rise} text-white/40`} style={{ animationDelay: `${780 + i * 140}ms` }}>
                        →
                      </span>
                    ) : null}
                  </span>
                ))}
                <span className={`${s.rise} rounded-full px-3 py-1.5 font-bold`} style={{ animationDelay: `${780 + p.route.length * 140}ms`, background: `linear-gradient(90deg, ${c1}, ${c2})`, color: ink }}>
                  from {p.from}
                </span>
              </div>

              {/* Addressed to whoever opened the link, which is rarely the person who made the plan. */}
              <p className={`${s.rise} mt-5 max-w-[460px] text-[17px] text-white/75`} style={{ animationDelay: "900ms" }}>
                {p.invitation}
              </p>

              <StartsIn now={now} startsAt={p.startsAt} endsAt={p.endsAt} />
              {p.note ? <Note text={p.note} reduced={reduced} /> : null}
            </div>
          </section>

          {/* ── the stops, down a line that draws itself ── */}
          <section className="min-w-0">
            <div className="mb-5 text-[13px] font-bold uppercase tracking-[0.18em] text-white/55">
              The plan · {p.stops.length} stop{p.stops.length === 1 ? "" : "s"}
            </div>
            <ol className="relative">
              <span aria-hidden className={s.rail} />
              {p.stops.map((st, i) => (
                <li key={st.key} className={`${s.stopIn} relative pl-[70px]`} style={{ animationDelay: `${600 + i * 280}ms` }}>
                  <span aria-hidden className={s.node} style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, animationDelay: `${900 + i * 280}ms` }}>
                    {st.emoji}
                  </span>
                  <div className={`${s.card} rounded-[24px] p-4 sm:p-5`} onMouseMove={tilt} onMouseLeave={untilt}>
                    {st.image ? <SmartImage src={st.image} alt={st.name} className="mb-4 h-[150px] rounded-[16px] sm:h-[180px]" /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2.5 py-1 font-mono text-[13px] font-bold" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})`, color: ink }}>
                        {st.time}
                      </span>
                      <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">{st.label}</span>
                    </div>
                    <h2 className="mt-2 text-[23px] font-extrabold leading-tight tracking-[-0.01em]">{st.name}</h2>
                    <div className="mt-0.5 text-[14px] text-white/55">📍 {st.area}</div>
                    {st.what ? <p className="mt-2.5 text-[15px] leading-relaxed text-white/75">{st.what}</p> : null}
                    {st.dishes.length ? (
                      <div className="mt-3 rounded-[16px] border border-white/10 bg-white/[0.04] px-3.5 py-3">
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">On the plan</div>
                        <ul className="mt-1.5 grid gap-1">
                          {st.dishes.map((d) => (
                            <li key={d.item} className="flex items-baseline gap-2 text-[15px] text-white/85">
                              <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full" style={{ background: c1 }} />
                              <span className="min-w-0">
                                {d.item}
                                {d.qty > 1 ? <span className="text-white/45"> &times;{d.qty}</span> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {st.whatsOn.map((line) => (
                      <div key={line} className="mt-2 text-[14px] font-semibold" style={{ color: c1 }}>
                        ✨ {line}
                      </div>
                    ))}
                    {/*
                      The one link worth having here. Somebody opening a plan they
                      did not make wants to see what the place looks like. Omitted
                      rather than greyed: a dead icon is a gap in our catalogue that
                      means nothing to the guest.
                    */}
                    {st.instagram ? (
                      <a href={st.instagram} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-bold hover:underline" style={{ color: c1 }}>
                        See it on Instagram <span className={s.nudge}>→</span>
                      </a>
                    ) : null}
                  </div>
                  {i < p.stops.length - 1 ? (
                    <div className="flex items-center gap-2 py-4 text-[14px] text-white/55">
                      <span className={s.car} aria-hidden>
                        🚗
                      </span>
                      a short ride, ~{p.hops[i] ?? 12} min
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>

            <div className={`${s.rise} mt-10 text-center`} style={{ animationDelay: `${900 + p.stops.length * 280}ms` }}>
              <p className="mx-auto max-w-[420px] text-[20px] font-bold leading-snug">{p.closing}</p>
              <p className="mt-4 text-[15px] italic text-white/55">planned with care on</p>
              <div className="mt-2 flex items-center justify-center gap-2.5">
                <span className={s.tile} style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, color: ink }}>
                  D
                </span>
                <span className="text-[24px] font-extrabold tracking-[-0.02em]">
                  Du<span style={{ color: c2 }}>ro!</span>
                </span>
              </div>
            </div>

            <GetTheApp
              reduced={reduced}
              ink={ink}
              eyebrow="Want one of these?"
              className="mt-10"
              prices={false}
              storeHref={storeLink("shared_plan")}
              onStore={() => trackShare("app_store", "shared_plan", p.slug)}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
