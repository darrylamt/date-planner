"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VENUE_VIBE_TAGS } from "@/lib/catalog";
import type { Audience } from "@/lib/types";
import { NightPreview, type PreviewData } from "./NightPreview";
import { PlaceForm } from "./PlaceForm";
import { PosterUpload } from "./PosterUpload";
import { Confetti } from "./Confetti";
import { Sheet } from "./Sheet";
import {
  AUDIENCES,
  KINDS,
  MAX_VIBES,
  customKindKey,
  friendlyDate,
  friendlyTime,
  kindOf,
  todayIso,
  vibeLabel,
  type Night,
  type Place,
} from "./nights";
import { IconArrow, IconBack, IconCheck, IconClose, IconPlus, IconSearch, IconSparkle, IconWarn } from "./icons";

type StepKey = "basics" | "when" | "where" | "door" | "feel" | "poster" | "review";

const STEPS: { key: StepKey; title: string; sub: string }[] = [
  { key: "basics", title: "What's the night?", sub: "Its name, and the kind of night it is." },
  { key: "when", title: "When is it?", sub: "Pick the date and the time it starts." },
  { key: "where", title: "Where is it?", sub: "Any venue on Duro, or a place you add." },
  { key: "door", title: "Getting in", sub: "What it costs at the door, and who can come." },
  { key: "feel", title: "What's it like?", sub: "So we can match it to the right people." },
  { key: "poster", title: "Poster and contact", sub: "The picture people see first." },
  { key: "review", title: "Looks good?", sub: "This is the card people see in their plan." },
];

type CostMode = "free" | "paid" | "unknown";

interface Draft {
  title: string;
  category: string;
  customKind: string;
  dates: string[];
  time: string;
  venueId: string;
  costMode: CostMode;
  cost: string;
  bookingUrl: string;
  audience: Audience;
  vibes: string[];
  description: string;
  image: string;
  phone: string;
}

const DRAFT_KEY = "duro.planner.draft";

function fromNight(n: Night | null, keepDate: boolean, usualPlace: string | null): Draft {
  const listed = n ? kindOf(n.category) : null;
  return {
    title: n?.title ?? "",
    category: n ? (listed ? n.category : "custom") : "party",
    customKind: n && !listed ? n.category.replace(/_/g, " ") : "",
    dates: n && keepDate ? [n.event_date] : [],
    time: n?.start_time?.slice(0, 5) ?? "20:00",
    venueId: n?.venue_id ?? usualPlace ?? "",
    costMode: n ? (n.cost_ghs == null ? "unknown" : Number(n.cost_ghs) === 0 ? "free" : "paid") : "free",
    cost: n?.cost_ghs != null && Number(n.cost_ghs) > 0 ? String(Math.round(Number(n.cost_ghs))) : "",
    bookingUrl: n?.booking_url ?? "",
    audience: (n?.audience ?? "everyone") as Audience,
    vibes: n?.vibe_tags ?? [],
    description: n?.description ?? "",
    image: n?.image_url ?? "",
    phone: n?.contact_phone ?? "",
  };
}

/** The next given weekday on or after today, as an ISO date. */
function nextWeekday(target: number): string {
  const now = new Date(todayIso() + "T00:00:00Z");
  const diff = (target - now.getUTCDay() + 7) % 7;
  now.setUTCDate(now.getUTCDate() + diff);
  return now.toISOString().slice(0, 10);
}

/**
 * Putting a night on, one question at a time.
 *
 * The old form asked fourteen things on one long page, laid out for a desktop
 * and most of it optional in ways it never said. A planner fills this in on
 * a phone, often between other things, so each screen asks one thing, says
 * why it matters, and shows the card it is building. Nothing is sent until
 * the last screen, and a half-finished night survives a reload.
 */
export function NightWizard({
  mode,
  initial,
  places: initialPlaces,
  areas,
  organiser,
  usualPlace,
  canPublish,
}: {
  mode: "new" | "edit";
  /** The night being edited, or the one being run again. */
  initial: Night | null;
  places: Place[];
  areas: { id: string; name: string }[];
  organiser: { name: string; logoUrl: string | null };
  usualPlace: string | null;
  canPublish: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [places, setPlaces] = useState(initialPlaces);
  const [d, setD] = useState<Draft>(() => fromNight(initial, mode === "edit", usualPlace));
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [done, setDone] = useState<null | { count: number }>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addingPlace, setAddingPlace] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState("");
  const top = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  /*
   * A new night's draft lives in this tab until it is published, so a detour
   * to find the Maps link, or a reload, does not cost them what they typed.
   * Not for an edit, where the saved night is the draft.
   */
  useEffect(() => {
    if (mode !== "new" || initial) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { draft: Draft; step: number };
        if (saved.draft?.title || saved.draft?.dates?.length) {
          setD({ ...saved.draft, dates: saved.draft.dates.filter((x) => x >= todayIso()) });
          setStep(Math.min(saved.step ?? 0, STEPS.length - 1));
          setRestored(true);
        }
      }
    } catch {
      /* A blocked or empty store just means a fresh start. */
    }
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "new" || done) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: d, step }));
    } catch {
      /* Nothing to do without storage. */
    }
  }, [d, step, mode, done]);

  const place = places.find((p) => p.id === d.venueId) ?? null;
  const cost = d.costMode === "free" ? 0 : d.costMode === "paid" ? Number(d.cost) || null : null;
  const category = d.category === "custom" ? customKindKey(d.customKind) : d.category;
  const preview: PreviewData = {
    title: d.title,
    category,
    date: [...d.dates].sort()[0] ?? "",
    time: d.time,
    placeName: place?.name ?? "",
    area: place?.area ?? "",
    cost,
    audience: d.audience,
    description: d.description,
    image: d.image,
    bookingUrl: d.bookingUrl,
    organiser,
  };

  /** Why this step cannot be left yet, or null when it can. */
  function blocker(key: StepKey): string | null {
    if (key === "basics") {
      if (d.title.trim().length < 2) return "Give your night a name.";
      if (d.category === "custom" && !d.customKind.trim()) return "Say what kind of night it is.";
    }
    if (key === "when") {
      if (!d.dates.length) return "Pick a date.";
      if (!d.time) return "Pick the time it starts.";
    }
    if (key === "where" && !place) return "Choose where it is happening.";
    if (key === "door" && d.costMode === "paid" && !(Number(d.cost) > 0)) return "Type the price at the door, or choose Free.";
    return null;
  }

  function go(to: number) {
    setError(null);
    setDir(to > step ? "fwd" : "back");
    setStep(to);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function next() {
    const why = blocker(STEPS[step].key);
    if (why) return setError(why);
    go(Math.min(step + 1, STEPS.length - 1));
  }

  async function publish() {
    for (const s of STEPS) {
      const why = blocker(s.key);
      if (why) {
        go(STEPS.indexOf(s));
        return setError(why);
      }
    }
    if (!place) return;
    setBusy(true);
    setError(null);

    const row = {
      title: d.title.trim(),
      description: d.description.trim() || null,
      venue_id: place.id,
      area_id: place.area_id,
      start_time: d.time,
      cost_ghs: cost,
      category,
      vibe_tags: d.vibes,
      image_url: d.image.trim() || null,
      contact_phone: d.phone.trim() || null,
      booking_url: d.bookingUrl.trim() || null,
      audience: d.audience,
      organiser_name: organiser.name,
      organiser_logo_url: organiser.logoUrl,
    };

    if (mode === "edit" && initial) {
      const { error: err } = await supabase
        .from("events")
        .update({ ...row, event_date: d.dates[0] })
        .eq("id", initial.id);
      setBusy(false);
      if (err) return setError("We could not save that. Check your connection and try again.");
      router.push("/planner?saved=1");
      router.refresh();
      return;
    }

    const dates = [...new Set(d.dates)].sort();
    const { error: err } = await supabase.from("events").insert(dates.map((event_date) => ({ ...row, event_date })));
    setBusy(false);
    if (err) return setError("We could not put that on. Check your connection and try again.");
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Fine. */
    }
    setDone({ count: dates.length });
  }

  async function remove() {
    if (!initial) return;
    setBusy(true);
    const { error: err } = await supabase.from("events").delete().eq("id", initial.id);
    setBusy(false);
    if (err) return setError("We could not delete that. Try again.");
    router.push("/planner?deleted=1");
    router.refresh();
  }

  function startOver() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Fine. */
    }
    setD(fromNight(null, false, usualPlace));
    setRestored(false);
    setDone(null);
    go(0);
  }

  /* ── Published ─────────────────────────────────────────────────────── */
  if (done) {
    return (
      <div className="relative mx-auto max-w-[520px] pt-6 text-center">
        <Confetti />
        <div className="pl-pop mx-auto grid h-20 w-20 place-items-center rounded-full bg-[var(--p-ok)] text-white shadow-[0_14px_30px_-12px_rgb(15_118_110/0.8)]">
          <IconCheck size={40} />
        </div>
        <h1 className="pl-up mt-6 text-[28px] font-bold leading-tight" style={{ animationDelay: "120ms" }}>
          {done.count > 1 ? `${done.count} nights are on!` : "Your night is on!"}
        </h1>
        <p className="pl-up mt-2 text-[16px] text-[var(--p-muted)]" style={{ animationDelay: "200ms" }}>
          {d.title.trim()} is live now. Anybody planning an evening near {place?.area || "it"} on{" "}
          {done.count > 1 ? "those dates" : friendlyDate(d.dates[0])} can be offered it.
        </p>
        <div className="pl-up mx-auto mt-6 max-w-[360px]" style={{ animationDelay: "280ms" }}>
          <NightPreview data={preview} />
        </div>
        <div className="pl-up mt-7 flex flex-col gap-3" style={{ animationDelay: "360ms" }}>
          <Link href="/planner" className="pl-btn w-full" onClick={() => router.refresh()}>
            See all your nights
          </Link>
          <button
            type="button"
            className="pl-btn-soft w-full"
            onClick={() => {
              setD((cur) => ({ ...cur, dates: [] }));
              setDone(null);
              go(1);
            }}
          >
            <IconPlus size={18} /> Same night, another date
          </button>
          <button type="button" className="pl-btn-ghost w-full" onClick={startOver}>
            Put on a different night
          </button>
        </div>
      </div>
    );
  }

  const s = STEPS[step];
  const needle = search.trim().toLowerCase();
  const shown = places.filter(
    (p) => p.id === d.venueId || !needle || p.name.toLowerCase().includes(needle) || p.area.toLowerCase().includes(needle)
  );
  const favourites = shown.filter((p) => p.mine || p.id === usualPlace);
  const others = shown.filter((p) => !p.mine && p.id !== usualPlace);

  return (
    <div ref={top} className="scroll-mt-24">
      {/* Progress and the way out */}
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/planner"
          aria-label="Close without saving"
          className="pl-tap grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white ring-1 ring-[var(--p-line)] transition-transform active:scale-95"
        >
          <IconClose size={20} />
        </Link>
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold text-[var(--p-muted)]">
            <span>
              {mode === "edit" ? "Editing" : initial ? "Running it again" : "New night"} · Step {step + 1} of {STEPS.length}
            </span>
            <button type="button" className="font-bold text-[var(--p-accent)] lg:hidden" onClick={() => setPreviewOpen(true)}>
              Preview
            </button>
          </div>
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((x, i) => (
              <span
                key={x.key}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--p-line)]"
              >
                <span
                  className="block h-full rounded-full bg-[var(--p-accent)] transition-[width] duration-500 ease-out"
                  style={{ width: i <= step ? "100%" : "0%" }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>

      {restored && step === 0 ? (
        <div className="pl-up mb-4 flex items-center justify-between gap-3 rounded-2xl bg-[#fbefd6] px-4 py-3 text-[14px]">
          <span>We kept what you had typed.</span>
          <button type="button" className="font-bold text-[var(--p-accent-dark)] underline" onClick={startOver}>
            Start over
          </button>
        </div>
      ) : null}

      {!canPublish ? (
        <div className="mb-4 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
          Your account is switched off, so you can look but not publish. Get in touch with us under Help.
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div key={s.key} className={dir === "fwd" ? "pl-in-right" : "pl-in-left"}>
          <h1 className="text-[28px] font-bold leading-tight md:text-[32px]">{s.title}</h1>
          <p className="mt-1.5 text-[16px] text-[var(--p-muted)]">{s.sub}</p>

          <div className="mt-6">
            {s.key === "basics" ? (
              <div className="flex flex-col gap-6">
                <label className="block">
                  <span className="pl-label">Name</span>
                  <input
                    className="pl-input pl-input-big"
                    value={d.title}
                    maxLength={80}
                    autoFocus
                    placeholder="Recovery Saturdays"
                    onChange={(e) => set("title", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && next()}
                  />
                  <span className="pl-hint mt-1.5 block">What it says on your poster.</span>
                </label>
                <div>
                  <span className="pl-label">What kind of night?</span>
                  <div className="flex flex-wrap gap-2">
                    {KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        className="pl-chip"
                        aria-pressed={d.category === k.id}
                        onClick={() => set("category", k.id)}
                      >
                        <span>{k.emoji}</span> {k.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="pl-chip"
                      aria-pressed={d.category === "custom"}
                      onClick={() => set("category", "custom")}
                    >
                      <IconSparkle size={16} /> Something else
                    </button>
                  </div>
                  {d.category === "custom" ? (
                    <input
                      className="pl-input pl-fade mt-3"
                      value={d.customKind}
                      maxLength={40}
                      autoFocus
                      placeholder="Say what it is, in a few words"
                      onChange={(e) => set("customKind", e.target.value)}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {s.key === "when" ? (
              <WhenStep d={d} set={set} single={mode === "edit"} />
            ) : null}

            {s.key === "where" ? (
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--p-muted)]" />
                  <input
                    className="pl-input !pl-12"
                    value={search}
                    placeholder="Search a venue or part of town"
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {favourites.length ? (
                  <PlaceGroup label="Yours and your usual" places={favourites} chosen={d.venueId} onPick={(id) => set("venueId", id)} usual={usualPlace} />
                ) : null}
                <PlaceGroup
                  label={needle ? "Matching venues" : "Venues on Duro"}
                  places={others.slice(0, needle ? 60 : 30)}
                  chosen={d.venueId}
                  onPick={(id) => set("venueId", id)}
                  usual={usualPlace}
                />
                {!needle && others.length > 30 ? (
                  <p className="pl-hint">Showing 30 of {others.length}. Search to find the rest.</p>
                ) : null}
                {needle && !shown.length ? (
                  <p className="pl-hint">Nothing on Duro matches &ldquo;{search}&rdquo;.</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => setAddingPlace(true)}
                  className="pl-tap flex items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--p-line)] bg-white px-4 py-4 text-left transition-colors hover:border-[var(--p-accent)]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--p-accent-soft)] text-[var(--p-accent)]">
                    <IconPlus />
                  </span>
                  <span>
                    <span className="block text-[15.5px] font-bold">Not on Duro? Add the place</span>
                    <span className="block text-[13.5px] text-[var(--p-muted)]">A lawn, a rooftop, a studio. It goes live straight away.</span>
                  </span>
                </button>
              </div>
            ) : null}

            {s.key === "door" ? (
              <div className="flex flex-col gap-6">
                <div className="grid gap-2.5" role="radiogroup" aria-label="Entry">
                  {(
                    [
                      { id: "free", title: "Free to get in", body: "Nobody pays at the door." },
                      { id: "paid", title: "People pay at the door", body: "Or buy a ticket. Type the price for one person." },
                      { id: "unknown", title: "Not sure yet", body: "You can add it later." },
                    ] as { id: CostMode; title: string; body: string }[]
                  ).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={d.costMode === o.id}
                      onClick={() => set("costMode", o.id)}
                      className={`pl-tap flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition-colors ${
                        d.costMode === o.id ? "border-[var(--p-accent)] bg-[var(--p-accent-soft)]" : "border-[var(--p-line)] bg-white hover:border-[var(--p-accent)]"
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                          d.costMode === o.id ? "border-[var(--p-accent)] bg-[var(--p-accent)] text-white" : "border-[var(--p-line)]"
                        }`}
                      >
                        {d.costMode === o.id ? <IconCheck size={14} /> : null}
                      </span>
                      <span>
                        <span className="block text-[16px] font-bold">{o.title}</span>
                        <span className="block text-[13.5px] text-[var(--p-muted)]">{o.body}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {d.costMode === "paid" ? (
                  <div className="pl-fade">
                    <span className="pl-label">Price for one person</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-[var(--p-muted)]">GHS</span>
                      <input
                        className="pl-input pl-input-big !pl-16"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={d.cost}
                        placeholder="100"
                        onChange={(e) => set("cost", e.target.value)}
                      />
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {[50, 100, 150, 200, 300].map((n) => (
                        <button key={n} type="button" className="pl-chip !min-h-[38px]" aria-pressed={d.cost === String(n)} onClick={() => set("cost", String(n))}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <p className="pl-hint mt-2">We add it to people&apos;s budgets, so nobody is surprised at the door.</p>
                  </div>
                ) : null}

                {d.costMode === "unknown" ? (
                  <div className="pl-fade flex gap-3 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]">
                    <IconWarn className="mt-0.5 shrink-0" />
                    <span>Until there is a price, plans with a budget leave this night out. It is the biggest reason a night does not show up.</span>
                  </div>
                ) : null}

                <label className="block">
                  <span className="pl-label">Ticket link (optional)</span>
                  <input
                    className="pl-input"
                    value={d.bookingUrl}
                    inputMode="url"
                    placeholder="https://… your ticket page"
                    onChange={(e) => set("bookingUrl", e.target.value)}
                  />
                  <span className="pl-hint mt-1.5 block">Shows a Tickets button on the card.</span>
                </label>

                <div>
                  <span className="pl-label">Who can come?</span>
                  <div className="flex flex-wrap gap-2">
                    {AUDIENCES.map((a) => (
                      <button key={a.id} type="button" className="pl-chip" aria-pressed={d.audience === a.id} onClick={() => set("audience", a.id)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <p className="pl-hint mt-2">Only if nobody else can come. Free entry for ladies is still Everyone.</p>
                </div>
              </div>
            ) : null}

            {s.key === "feel" ? (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="pl-label !mb-0">The vibe</span>
                    <span className="text-[13px] font-semibold text-[var(--p-muted)]">
                      {d.vibes.length} of {MAX_VIBES}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {VENUE_VIBE_TAGS.map((v) => {
                      const on = d.vibes.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          className="pl-chip"
                          aria-pressed={on}
                          disabled={!on && d.vibes.length >= MAX_VIBES}
                          onClick={() => set("vibes", on ? d.vibes.filter((x) => x !== v) : [...d.vibes, v])}
                        >
                          {on ? <IconCheck size={15} /> : null}
                          {vibeLabel(v)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="pl-hint mt-2">How this night feels, which can be different from the venue on other nights.</p>
                </div>
                <label className="block">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="pl-label !mb-0">What to expect</span>
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--p-muted)]">{d.description.length}/400</span>
                  </div>
                  <textarea
                    className="pl-input"
                    value={d.description}
                    maxLength={400}
                    placeholder="Who is playing, what the night is like, what to wear."
                    onChange={(e) => set("description", e.target.value)}
                  />
                  <span className="pl-hint mt-1.5 block">Shown under your night&apos;s name. Two or three plain sentences work best.</span>
                </label>
              </div>
            ) : null}

            {s.key === "poster" ? (
              <div className="flex flex-col gap-6">
                <PosterUpload value={d.image} onChange={(url) => set("image", url)} />
                <label className="block">
                  <span className="pl-label">Who should people call about it? (optional)</span>
                  <input
                    className="pl-input"
                    value={d.phone}
                    inputMode="tel"
                    placeholder="+233 …"
                    onChange={(e) => set("phone", e.target.value)}
                  />
                  <span className="pl-hint mt-1.5 block">Shown on this night only.</span>
                </label>
              </div>
            ) : null}

            {s.key === "review" ? (
              <div className="flex flex-col gap-5">
                <div className="lg:hidden">
                  <NightPreview data={preview} />
                </div>
                <Checklist d={d} place={place} organiser={organiser} onEdit={(k) => go(STEPS.findIndex((x) => x.key === k))} />
                {mode === "edit" ? (
                  <button type="button" className="self-start text-[14px] font-semibold text-[var(--p-accent-dark)] underline" onClick={() => setConfirmDelete(true)}>
                    Delete this night
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* The card it is building, beside the questions on a wide screen. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">How it looks in a plan</div>
            <NightPreview data={preview} />
          </div>
        </aside>
      </div>

      {/* Back and Next, where a thumb is. */}
      <div className="pl-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--p-line)] bg-white/95 backdrop-blur-md">
        <div className="mx-auto w-full max-w-[1040px] px-4 pt-3 md:px-6">
          {error ? (
            <div role="alert" className="pl-fade mb-2.5 flex items-center gap-2 text-[14px] font-semibold text-[var(--p-accent-dark)]">
              <IconWarn /> {error}
            </div>
          ) : null}
          <div className="flex gap-3 lg:max-w-[calc(100%-372px)]">
            {step > 0 ? (
              <button type="button" className="pl-btn-ghost !px-4" onClick={() => go(step - 1)} aria-label="Back">
                <IconBack />
              </button>
            ) : null}
            {s.key === "review" ? (
              <button type="button" className="pl-btn flex-1" disabled={busy || !canPublish} onClick={() => void publish()}>
                {busy ? "Saving…" : mode === "edit" ? "Save changes" : d.dates.length > 1 ? `Put on ${d.dates.length} nights` : "Put it on"}
              </button>
            ) : (
              <button type="button" className="pl-btn flex-1" onClick={next}>
                {["door", "feel", "poster"].includes(s.key) && isEmptyOptional(s.key, d) ? "Skip for now" : "Next"} <IconArrow size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      <Sheet open={previewOpen} onClose={() => setPreviewOpen(false)} title="How it looks in a plan">
        <NightPreview data={preview} />
      </Sheet>

      <Sheet open={addingPlace} onClose={() => setAddingPlace(false)} title="Add a place">
        <PlaceForm
          areas={areas}
          known={places.map((p) => p.id)}
          onCancel={() => setAddingPlace(false)}
          onCreated={(p) => {
            setPlaces((cur) => [p, ...cur]);
            set("venueId", p.id);
            setSearch("");
            setAddingPlace(false);
          }}
        />
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this night?">
        <p className="text-[15px] text-[var(--p-ink-2)]">
          {d.title} comes out of plans straight away. Plans people already saved keep it. This cannot be undone.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <button type="button" className="pl-btn !bg-[#b42318]" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete it"}
          </button>
          <button type="button" className="pl-btn-ghost" onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/** Optional steps say "Skip for now" until something is in them. */
function isEmptyOptional(key: string, d: Draft): boolean {
  if (key === "door") return false;
  if (key === "feel") return !d.vibes.length && !d.description.trim();
  if (key === "poster") return !d.image && !d.phone.trim();
  return false;
}

function WhenStep({
  d,
  set,
  single,
}: {
  d: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  single: boolean;
}) {
  const today = todayIso();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const quick = useMemo(() => {
    const out = [
      { label: "Tonight", iso: today },
      { label: "Tomorrow", iso: tomorrow },
      { label: "This Friday", iso: nextWeekday(5) },
      { label: "This Saturday", iso: nextWeekday(6) },
    ];
    // No two chips for the same day: on a Friday, "Tonight" and "This Friday" are one.
    return out.filter((q, i) => out.findIndex((x) => x.iso === q.iso) === i);
  }, [today, tomorrow]);

  /*
   * The box holds a pick until it is added. iOS fires a change on every turn
   * of the date wheel, so adding on change would add every date scrolled past.
   */
  const [pick, setPick] = useState("");

  const toggle = (iso: string) => {
    if (single) return set("dates", [iso]);
    set("dates", d.dates.includes(iso) ? d.dates.filter((x) => x !== iso) : [...d.dates, iso].sort());
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="pl-label">Date</span>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <button key={q.iso} type="button" className="pl-chip" aria-pressed={d.dates.includes(q.iso)} onClick={() => toggle(q.iso)}>
              {q.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Pick a date</span>
            <input
              type="date"
              className="pl-input"
              min={today}
              value={single ? d.dates[0] ?? "" : pick}
              onChange={(e) => (single ? e.target.value && set("dates", [e.target.value]) : setPick(e.target.value))}
            />
          </label>
          {!single ? (
            <button
              type="button"
              className="pl-btn-soft shrink-0"
              disabled={!pick || pick < today}
              onClick={() => {
                if (!d.dates.includes(pick)) toggle(pick);
                setPick("");
              }}
            >
              <IconPlus size={18} /> Add
            </button>
          ) : null}
        </div>
        <p className="pl-hint mt-1.5">{single ? "Pick a different date to move it." : "Any other date: pick it, then Add. Running it every week? Add each date and we put each one on."}</p>

        {d.dates.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {d.dates.map((iso) => (
              <span key={iso} className="pl-pop inline-flex items-center gap-1.5 rounded-full bg-[var(--p-ink)] py-1.5 pl-3.5 pr-1.5 text-[14px] font-semibold text-white">
                {friendlyDate(iso)}
                {!single ? (
                  <button
                    type="button"
                    aria-label={`Remove ${friendlyDate(iso)}`}
                    className="grid h-6 w-6 place-items-center rounded-full bg-white/15 hover:bg-white/30"
                    onClick={() => toggle(iso)}
                  >
                    <IconClose size={14} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <span className="pl-label">Starts at</span>
        <div className="flex flex-wrap gap-2">
          {["18:00", "19:00", "20:00", "21:00", "22:00"].map((t) => (
            <button key={t} type="button" className="pl-chip" aria-pressed={d.time === t} onClick={() => set("time", t)}>
              {friendlyTime(t)}
            </button>
          ))}
        </div>
        <input type="time" className="pl-input mt-3" value={d.time} onChange={(e) => set("time", e.target.value)} />
        <p className="pl-hint mt-1.5">We only offer your night to plans that are out at that time.</p>
      </div>
    </div>
  );
}

function PlaceGroup({
  label,
  places,
  chosen,
  onPick,
  usual,
}: {
  label: string;
  places: Place[];
  chosen: string;
  onPick: (id: string) => void;
  usual: string | null;
}) {
  if (!places.length) return null;
  return (
    <div>
      <div className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">{label}</div>
      <div className="grid gap-2">
        {places.map((p) => {
          const on = p.id === chosen;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(p.id)}
              className={`pl-tap flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors ${
                on ? "border-[var(--p-accent)] bg-[var(--p-accent-soft)]" : "border-[var(--p-line)] bg-white hover:border-[var(--p-accent)]"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-bold">{p.name}</span>
                <span className="block text-[13px] text-[var(--p-muted)]">
                  {p.area}
                  {p.mine ? " · Your place" : p.id === usual ? " · Where you usually are" : ""}
                </span>
              </span>
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all ${
                  on ? "scale-100 bg-[var(--p-accent)] text-white" : "scale-90 border-2 border-[var(--p-line)]"
                }`}
              >
                {on ? <IconCheck size={15} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Checklist({
  d,
  place,
  organiser,
  onEdit,
}: {
  d: Draft;
  place: Place | null;
  organiser: { name: string; logoUrl: string | null };
  onEdit: (k: StepKey) => void;
}) {
  const rows: { k: StepKey; label: string; value: string; warn?: string }[] = [
    { k: "basics", label: "Name", value: d.title.trim() || "Not set" },
    {
      k: "when",
      label: d.dates.length > 1 ? "Dates" : "Date",
      value: d.dates.length ? `${d.dates.map(friendlyDate).join(", ")} · ${friendlyTime(d.time)}` : "Not set",
    },
    { k: "where", label: "Where", value: place ? `${place.name}, ${place.area}` : "Not set" },
    {
      k: "door",
      label: "Entry",
      value: d.costMode === "free" ? "Free" : d.costMode === "paid" ? `GHS ${d.cost || "?"} a person` : "Not sure yet",
      warn: d.costMode === "unknown" ? "Left out of plans with a budget until it has a price" : undefined,
    },
    {
      k: "feel",
      label: "Vibe",
      value: d.vibes.length ? d.vibes.map(vibeLabel).join(", ") : "None picked",
      warn: !d.vibes.length ? "Picking a vibe helps us offer it to the right people" : undefined,
    },
    {
      k: "poster",
      label: "Poster",
      value: d.image ? "Added" : "None",
      warn: !d.image ? "Nights with a poster get picked more" : undefined,
    },
  ];

  return (
    <div className="pl-card divide-y divide-[var(--p-line)]">
      {rows.map((r) => (
        <div key={r.k} className="flex items-start gap-3 px-4 py-3">
          <span
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
              r.warn ? "bg-[var(--p-warn-soft)] text-[var(--p-warn)]" : "bg-[var(--p-ok-soft)] text-[var(--p-ok)]"
            }`}
          >
            {r.warn ? <IconWarn size={14} /> : <IconCheck size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold uppercase tracking-[0.06em] text-[var(--p-muted)]">{r.label}</div>
            <div className="text-[15px] font-semibold">{r.value}</div>
            {r.warn ? <div className="text-[13px] text-[var(--p-warn)]">{r.warn}</div> : null}
          </div>
          <button type="button" className="shrink-0 text-[14px] font-bold text-[var(--p-accent)]" onClick={() => onEdit(r.k)}>
            Edit
          </button>
        </div>
      ))}
      {!organiser.logoUrl ? (
        <div className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--p-warn-soft)] text-[var(--p-warn)]">
            <IconWarn size={14} />
          </span>
          <div className="min-w-0 flex-1 text-[14px]">
            <div className="font-semibold">No logo on your account yet</div>
            <div className="text-[13px] text-[var(--p-muted)]">It goes beside &ldquo;Hosted by {organiser.name}&rdquo;. Add it under Profile, after this.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
