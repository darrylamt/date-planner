"use client";

import { useCallback, useEffect, useState } from "react";
import { BackArrow } from "@/components/BackArrow";
import { time12 } from "@/lib/format";
import { MonthCalendar } from "./MonthCalendar";
import { LoadingScreen } from "./LoadingScreen";
import { ErrorScreen, NoMatchScreen } from "./StatusScreens";
import { ItineraryView } from "./ItineraryView";
import { aboutName, possessiveName, pronounSet, pronounForGender } from "@/lib/pronouns";
import {
  DURATIONS,
  OCCASIONS,
  PARTY_SIZES,
  TOTAL_STEPS,
  VIBES,
  defaultInputs,
  partyLabel,
  startTimeOptions,
  vibeBlurb,
} from "@/lib/planConstants";
import type { Area, GenerateResponse, Gender, Itinerary, PlanInputs } from "@/lib/types";
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP } from "@/lib/budget";

/**
 * The multi-step input flow: one question per screen with a slim progress
 * indicator, exactly as designed — plus a pronoun/name field on the
 * personalisation step so anyone can plan for anyone.
 */

type Phase =
  | { name: "steps"; step: number }
  | { name: "loading" }
  | { name: "result"; itinerary: Itinerary }
  | { name: "no_match"; data: Extract<GenerateResponse, { status: "no_match" }> }
  | { name: "error"; message?: string };

const STORE_KEY = "aduro.plan.v1";

export function PlanFlow({ areas }: { areas: Area[] }) {
  const [inputs, setInputs] = useState<PlanInputs>(defaultInputs);
  const [phase, setPhase] = useState<Phase>({ name: "steps", step: 0 });
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore in-progress plans (survives the magic-link round trip).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.inputs) setInputs(saved.inputs);
        if (saved.itinerary) setPhase({ name: "result", itinerary: saved.itinerary });
        if (saved.shareSlug) setShareSlug(saved.shareSlug);
      }
    } catch {
      /* fresh start */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback(
    (next: { inputs?: PlanInputs; itinerary?: Itinerary | null; shareSlug?: string | null }) => {
      try {
        const raw = sessionStorage.getItem(STORE_KEY);
        const cur = raw ? JSON.parse(raw) : {};
        const merged = { ...cur, ...next };
        if (next.itinerary === null) delete merged.itinerary;
        sessionStorage.setItem(STORE_KEY, JSON.stringify(merged));
      } catch {
        /* storage unavailable */
      }
    },
    []
  );

  const update = (patch: Partial<PlanInputs>) => {
    setInputs((cur) => {
      const next = { ...cur, ...patch };
      persist({ inputs: next });
      return next;
    });
  };

  async function generate(overrides?: Partial<PlanInputs>) {
    const finalInputs = { ...inputs, ...overrides };
    if (overrides) update(overrides);
    setPhase({ name: "loading" });
    setShareSlug(null);
    persist({ shareSlug: null, itinerary: null });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalInputs),
      });
      const data: GenerateResponse = await res.json();
      if (data.status === "ok") {
        setPhase({ name: "result", itinerary: data.itinerary });
        persist({ itinerary: data.itinerary });
      } else if (data.status === "no_match") {
        setPhase({ name: "no_match", data });
      } else {
        setPhase({ name: "error", message: data.message });
      }
    } catch {
      setPhase({ name: "error" });
    }
  }

  // Auto-retry a pending save after the magic-link round trip.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (sessionStorage.getItem("aduro.pendingSave") === "1" && phase.name === "result") {
        sessionStorage.removeItem("aduro.pendingSave");
        void savePlan(phase.itinerary);
      }
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, phase.name]);

  async function savePlan(itinerary: Itinerary): Promise<string | null> {
    if (shareSlug) return shareSlug;
    setSaving(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, itinerary }),
      });
      if (res.status === 401) {
        sessionStorage.setItem("aduro.pendingSave", "1");
        window.location.href = "/login?next=/plan/new";
        return null;
      }
      const data = await res.json();
      if (data.share_slug) {
        setShareSlug(data.share_slug);
        persist({ shareSlug: data.share_slug });
        return data.share_slug;
      }
      return null;
    } catch {
      return null;
    } finally {
      setSaving(false);
    }
  }

  if (!hydrated) return <main className="min-h-screen bg-cream" />;

  if (phase.name === "loading") return <LoadingScreen inputs={inputs} />;

  if (phase.name === "no_match") {
    return (
      <NoMatchScreen
        headline={phase.data.headline}
        message={phase.data.message}
        suggestions={phase.data.suggestions}
        onSuggestion={(s) => {
          if (s.action === "raise_budget" && s.value) {
            void generate({ budget: s.value });
          } else {
            void generate({ surpriseMe: true, areaIds: [], areaNames: [] });
          }
        }}
        onStartOver={() => {
          setInputs(defaultInputs());
          sessionStorage.removeItem(STORE_KEY);
          setPhase({ name: "steps", step: 0 });
        }}
      />
    );
  }

  if (phase.name === "error") {
    return <ErrorScreen message={phase.message} onRetry={() => void generate()} />;
  }

  if (phase.name === "result") {
    return (
      <ItineraryView
        inputs={inputs}
        itinerary={phase.itinerary}
        onItineraryChange={(it) => {
          setPhase({ name: "result", itinerary: it });
          setShareSlug(null);
          persist({ itinerary: it, shareSlug: null });
        }}
        onEdit={() => setPhase({ name: "steps", step: TOTAL_STEPS - 1 })}
        shareSlug={shareSlug}
        onSave={() => savePlan(phase.itinerary)}
        saving={saving}
      />
    );
  }

  /* ── Step screens ── */
  const step = phase.step;
  const goBack = () =>
    step === 0 ? (window.location.href = "/") : setPhase({ name: "steps", step: step - 1 });
  const goNext = () =>
    step === TOTAL_STEPS - 1 ? void generate() : setPhase({ name: "steps", step: step + 1 });

  const ps = pronounSet(pronounForGender(inputs.partner.gender));
  const who = aboutName(inputs.partner.name, pronounForGender(inputs.partner.gender));
  const poss = possessiveName(inputs.partner.name, pronounForGender(inputs.partner.gender));

  const canContinue =
    (step !== 0 || inputs.surpriseMe || inputs.areaIds.length > 0) &&
    (step !== 3 || inputs.vibes.length > 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col">
      {/* Top bar + slim progress indicator */}
      <div className="flex items-center justify-between px-6 pt-4">
        <button className="backbtn" onClick={goBack} aria-label="Back">
          <BackArrow />
        </button>
        <div className="text-caption font-semibold text-mutedbrown">
          {step + 1} of {TOTAL_STEPS}
        </div>
      </div>
      <div className="flex gap-1.5 px-6 pt-[18px]">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <i key={i} className={`prog-seg ${i <= step ? "prog-on" : ""}`} />
        ))}
      </div>

      <div className="flex flex-1 flex-col px-6" key={step}>
        {step === 0 && (
          <>
            <h2 className="mb-2 mt-[26px] font-display text-stepq font-bold">Where in Accra?</h2>
            <p className="mb-[26px] text-body text-mutedbrown">
              Pick one or two areas — we&apos;ll keep the stops close together.
            </p>
            <div className="flex flex-col">
              {areas.map((a, i) => {
                const on = inputs.areaIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    className={`area-row ${on ? "area-row-on" : ""}`}
                    onClick={() => {
                      const ids = on
                        ? inputs.areaIds.filter((x) => x !== a.id)
                        : [...inputs.areaIds, a.id].slice(-2);
                      update({
                        areaIds: ids,
                        areaNames: areas.filter((x) => ids.includes(x.id)).map((x) => x.name),
                        surpriseMe: false,
                      });
                    }}
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="area-row-n">{String(i + 1).padStart(2, "0")}</span>
                      <span className="area-row-name">{a.name}</span>
                    </span>
                    <span className={`area-row-mark ${on ? "area-row-mark-on" : ""}`} />
                  </button>
                );
              })}
            </div>
            <button
              className={`mt-2 flex w-full items-center justify-between border-t border-dashed py-4 text-left transition-colors ${
                inputs.surpriseMe ? "border-flame" : "border-line"
              }`}
              onClick={() =>
                update({ surpriseMe: !inputs.surpriseMe, areaIds: [], areaNames: [] })
              }
            >
              <span>
                <span
                  className={`block font-display text-[17px] italic transition-colors ${
                    inputs.surpriseMe ? "font-bold not-italic text-flame" : "text-cocoa"
                  }`}
                >
                  Surprise me
                </span>
                <span className="mt-0.5 block text-[14px] text-mutedbrown">
                  We&apos;ll choose a corner of the city you haven&apos;t tried.
                </span>
              </span>
              <span className={`area-row-mark ${inputs.surpriseMe ? "area-row-mark-on" : ""}`} />
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="mb-2 mt-[26px] font-display text-stepq font-bold">
              What&apos;s the budget?
            </h2>
            <p className="mb-[26px] text-body text-mutedbrown">For both of you, all in.</p>
            <div className="my-2 text-center">
              <span className="font-display text-[56px] font-bold tracking-[-0.02em]">
                GHS {inputs.budget.toLocaleString()}
              </span>
            </div>
            <div className="px-1.5 py-2">
              <input
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                value={inputs.budget}
                onChange={(e) => update({ budget: Number(e.target.value) })}
                className="budget-slider"
                aria-label="Budget in Ghana cedis"
              />
            </div>
            <div className="flex justify-between px-1.5 text-caption text-mutedbrown">
              <span>GHS {BUDGET_MIN}</span>
              <span>GHS {BUDGET_MAX.toLocaleString()}</span>
            </div>
            <div className="mt-6">
              <span className="flbl">Or type it</span>
              <input
                className="inp w-[140px] font-mono font-bold"
                type="number"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                value={inputs.budget}
                onChange={(e) =>
                  update({
                    budget: Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, Number(e.target.value) || BUDGET_MIN)),
                  })
                }
              />
            </div>
            <div className="why mt-6">We keep the whole plan inside this — transport included.</div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="mb-2 mt-[26px] font-display text-stepq font-bold">
              When&apos;s the date?
            </h2>
            <p className="mb-[26px] text-body text-mutedbrown">
              We&apos;ll check what&apos;s open and what&apos;s on.
            </p>
            <MonthCalendar value={inputs.date} onChange={(date) => update({ date })} />
            <div className="mt-6">
              <span className="flbl">Start time</span>
              {/* Every half hour rather than five fixed options — 17:30 is not
                  the only time anyone leaves the house. */}
              <select
                className="inp w-[160px] font-mono"
                value={inputs.startTime}
                onChange={(e) => update({ startTime: e.target.value })}
              >
                {startTimeOptions().map((t: string) => (
                  <option key={t} value={t}>
                    {time12(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-6">
              <span className="flbl">How long?</span>
              <div className="tsel-row">
                {DURATIONS.map((d, i) => (
                  <span key={d.label} className="flex items-baseline">
                    {i > 0 && <span className="tsel-div" />}
                    <button
                      className={`tsel ${inputs.hours === d.hours ? "tsel-on" : ""}`}
                      onClick={() => update({ hours: d.hours })}
                    >
                      {d.label}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="mb-2 mt-[26px] font-display text-stepq font-bold">
              What&apos;s the vibe?
            </h2>
            <p className="mb-[26px] text-body text-mutedbrown">
              Choose up to three — we&apos;ll blend them.
            </p>
            <div className="tsel-row">
              {VIBES.map((v, i) => {
                const val = v.toLowerCase();
                const on = inputs.vibes.includes(val);
                return (
                  <span key={v} className="flex items-baseline">
                    {i > 0 && <span className="tsel-div" />}
                    <button
                      className={`tsel tsel-lg ${on ? "tsel-on" : ""}`}
                      onClick={() =>
                        update({
                          vibes: on
                            ? inputs.vibes.filter((x) => x !== val)
                            : [...inputs.vibes, val].slice(-3),
                        })
                      }
                    >
                      {v}
                    </button>
                  </span>
                );
              })}
            </div>
            {inputs.vibes.length > 0 && (
              <div className="why mt-[26px]">
                {vibeBlurb(inputs.vibes)}
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="mb-2 mt-[26px] font-display text-stepq font-bold">
              What&apos;s the occasion?
            </h2>
            <p className="mb-[26px] text-body text-mutedbrown">It changes the pace we plan for.</p>
            <div className="flex flex-col">
              {OCCASIONS.map((o, i) => {
                const on = inputs.occasion === o.id;
                return (
                  <button
                    key={o.id}
                    className={`flex items-center gap-4 border-b border-line/70 py-[18px] text-left transition-colors first:pt-0 ${
                      on ? "border-flame" : ""
                    }`}
                    onClick={() => update({ occasion: o.id })}
                  >
                    <span
                      className={`w-6 shrink-0 font-display text-[19px] italic transition-colors ${
                        on ? "font-bold not-italic text-flame" : "text-amber"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">
                      <span
                        className={`block text-[16px] font-bold transition-colors ${on ? "text-flame" : "text-ink"}`}
                      >
                        {o.title}
                      </span>
                      <span className="block text-[14px] text-mutedbrown">{o.sub}</span>
                    </span>
                    <span className={`area-row-mark ${on ? "area-row-mark-on" : ""}`} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="mb-2 mt-[26px] font-display text-stepq font-bold">
              Who is coming?
            </h2>
            <p className="mb-[26px] text-body text-mutedbrown">
              This sets the portions, the table and the budget split.
            </p>

            <div className="tsel-row">
              {PARTY_SIZES.map((n, i) => (
                <span key={n} className="flex items-baseline">
                  {i > 0 && <span className="tsel-div" />}
                  <button
                    className={`tsel ${inputs.partySize === n ? "tsel-on" : ""}`}
                    onClick={() =>
                      update({
                        partySize: n,
                        // Trim names that no longer have a seat.
                        companions: inputs.companions.slice(0, Math.max(0, n - 1)),
                      })
                    }
                  >
                    {n === 1 ? "Just me" : n}
                  </button>
                </span>
              ))}
            </div>

            {inputs.partySize === 2 && (
              <>
                <div className="mt-6">
                  <span className="flbl">Their name (optional)</span>
                  <input
                    className="inp"
                    placeholder="e.g. Ama, Kofi…"
                    value={inputs.partner.name}
                    maxLength={60}
                    onChange={(e) =>
                      update({ partner: { ...inputs.partner, name: e.target.value } })
                    }
                  />
                </div>
                <div className="mt-5">
                  <span className="flbl">Is it a him or a her? (optional)</span>
                  <div className="tsel-row">
                    {(
                      [
                        { id: "unspecified", label: "Rather not say" },
                        { id: "female", label: "Her" },
                        { id: "male", label: "Him" },
                      ] as { id: Gender; label: string }[]
                    ).map((g, i) => (
                      <span key={g.id} className="flex items-baseline">
                        {i > 0 && <span className="tsel-div" />}
                        <button
                          className={`tsel ${inputs.partner.gender === g.id ? "tsel-on" : ""}`}
                          onClick={() =>
                            update({ partner: { ...inputs.partner, gender: g.id } })
                          }
                        >
                          {g.label}
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {inputs.partySize > 2 && (
              <div className="mt-6">
                <span className="flbl">Who else is coming? (optional)</span>
                <input
                  className="inp"
                  placeholder="Ama, Kofi, Yaw…"
                  value={inputs.companions.join(", ")}
                  onChange={(e) =>
                    update({
                      companions: e.target.value
                        .split(",")
                        .map((n) => n.trim())
                        .filter(Boolean)
                        .slice(0, inputs.partySize - 1),
                    })
                  }
                />
                <div className="why mt-3">
                  Names are only used to make the plan read like it was written for
                  your group.
                </div>
              </div>
            )}

            {inputs.partySize === 1 && (
              <div className="why mt-6">
                A solo day. We will keep it to places that are good on your own —
                counter seats, somewhere comfortable to just be.
              </div>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <div className="kente mt-[26px] w-16" />
            <h2 className="mb-2 mt-3.5 font-display text-stepq font-bold">
              Now — tell us about {who}.
            </h2>
            <p className="mb-[22px] text-body text-mutedbrown">
              Make it personal. The details you add here are what turn a plan into a thoughtful
              date.
            </p>
            <div className="flex flex-col gap-[18px]">
              <div>
                <span className="flbl">A food or cuisine {ps.they} love{pronounForGender(inputs.partner.gender) === "they" ? "" : "s"}</span>
                <input
                  className="inp"
                  placeholder="e.g. jollof, sushi, waakye…"
                  value={inputs.partner.food}
                  onChange={(e) => update({ partner: { ...inputs.partner, food: e.target.value } })}
                />
              </div>
              <div>
                <span className="flbl">{ps.their.charAt(0).toUpperCase() + ps.their.slice(1)} kind of place</span>
                <input
                  className="inp"
                  placeholder="rooftops? gardens? cosy corners?"
                  value={inputs.partner.place}
                  onChange={(e) =>
                    update({ partner: { ...inputs.partner, place: e.target.value } })
                  }
                />
              </div>
              <div>
                <span className="flbl">Something {ps.they}&apos;{pronounForGender(inputs.partner.gender) === "they" ? "re" : "s"} into</span>
                <input
                  className="inp"
                  placeholder="a movie, artist, or hobby"
                  value={inputs.partner.interests}
                  onChange={(e) =>
                    update({ partner: { ...inputs.partner, interests: e.target.value } })
                  }
                />
              </div>
              <div>
                <span className="flbl">Anything to avoid?</span>
                <textarea
                  className="ta"
                  placeholder="allergies, loud music, long walks…"
                  value={inputs.partner.avoid}
                  onChange={(e) =>
                    update({ partner: { ...inputs.partner, avoid: e.target.value } })
                  }
                />
              </div>
            </div>
            <p className="mt-[18px] text-[14px] italic leading-relaxed text-mutedbrown">
              This stays between us — it&apos;s only used to shape {poss} evening.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-6 pb-7 pt-5">
        <button className="btn" onClick={goNext} disabled={!canContinue}>
          {step === TOTAL_STEPS - 1 ? `Build ${poss} evening` : "Continue"}
        </button>
      </div>
    </main>
  );
}


