"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/planner/Sheet";
import { PosterUpload } from "@/components/planner/PosterUpload";
import { Confetti } from "@/components/planner/Confetti";
import { IconPlus, IconSearch, IconWarn } from "@/components/planner/icons";
import type { MenuCategory, MenuItem } from "@/lib/types";
import { useToast } from "./ui";

const COURSES: { value: MenuCategory; label: string; emoji: string }[] = [
  { value: "starter", label: "Starters", emoji: "🥗" },
  { value: "main", label: "Mains", emoji: "🍛" },
  { value: "dessert", label: "Desserts", emoji: "🍰" },
  { value: "drink", label: "Drinks", emoji: "🍹" },
  { value: "activity", label: "Things to do", emoji: "🎳" },
  { value: "other", label: "Extras", emoji: "🍟" },
];
const emojiFor = (c: MenuCategory) => COURSES.find((x) => x.value === c)?.emoji ?? "🍽️";

export interface MenuScope {
  venueId: string;
  venueName: string;
  /** Where a shared menu is kept, when this branch borrows one. */
  ownerId: string;
  /** How many venues eat off the shared list, including the owner. */
  branchCount: number;
}

interface Draft {
  id: string | null;
  name: string;
  price: string;
  category: MenuCategory;
  notes: string;
  image: string;
  alcoholic: boolean | null;
  everywhere: boolean;
}

const blank = (category: MenuCategory = "main"): Draft => ({
  id: null,
  name: "",
  price: "",
  category,
  notes: "",
  image: "",
  alcoholic: null,
  everywhere: true,
});

/**
 * The menu, as a list you can search and tap.
 *
 * Every change is one dish at a time in a sheet that slides up: name, price,
 * course, and then the optional things (a description, a picture, whether a
 * drink has alcohol in it). Adding several in a row keeps the sheet open.
 *
 * ── branches ────────────────────────────────────────────────────────────
 * A group with one menu keeps it on one row (the owner). A dish written on
 * the owner is on every branch; one written on a branch is on that branch
 * alone. So adding asks "every branch, or just here", and only when there is
 * more than one branch for it to mean anything.
 */
export function MenuManager({ scope, items }: { scope: MenuScope; items: MenuItem[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState(items);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState<MenuCategory | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [party, setParty] = useState(false);
  const { say, toast } = useToast();
  const branched = scope.branchCount > 1;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const needle = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) => (course === "all" || r.category === course) && (!needle || r.name.toLowerCase().includes(needle) || (r.notes ?? "").toLowerCase().includes(needle))
  );
  const groups = useMemo(
    () =>
      COURSES.map((c) => ({
        ...c,
        items: filtered.filter((r) => r.category === c.value).sort((a, b) => Number(a.price_ghs) - Number(b.price_ghs) || a.name.localeCompare(b.name)),
      })).filter((g) => g.items.length),
    [filtered]
  );
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const unpriced = rows.filter((r) => !(Number(r.price_ghs) > 0)).length;

  function openNew() {
    setError(null);
    setDraft(blank(course === "all" ? "main" : course));
  }

  function openEdit(r: MenuItem) {
    setError(null);
    setDraft({
      id: r.id,
      name: r.name,
      price: Number(r.price_ghs) > 0 ? String(Number(r.price_ghs)) : "",
      category: r.category,
      notes: r.notes ?? "",
      image: r.image_url ?? "",
      alcoholic: r.is_alcoholic ?? null,
      everywhere: r.venue_id === scope.ownerId,
    });
  }

  async function save(another = false) {
    if (!draft) return;
    const name = draft.name.trim();
    const price = Number(draft.price);
    if (!name) return setError("What is it called?");
    if (!(price > 0)) return setError("Add a price. Without one, plans can't include it.");
    setBusy(true);
    setError(null);
    const fields: Record<string, unknown> = {
      name,
      price_ghs: price,
      category: draft.category,
      notes: draft.notes.trim() || null,
      image_url: draft.image.trim() || null,
      // Only drinks are asked. Food is never alcoholic as far as a plan is concerned.
      is_alcoholic: draft.category === "drink" ? draft.alcoholic : false,
    };

    if (draft.id) {
      const { data, error: err } = await supabase.from("menu_items").update(fields).eq("id", draft.id).select("*").single();
      setBusy(false);
      if (err || !data) return setError("That did not save. Try again.");
      setRows((rs) => rs.map((r) => (r.id === draft.id ? (data as MenuItem) : r)));
      setDraft(null);
      return say("Saved");
    }

    const venue_id = branched && !draft.everywhere ? scope.venueId : scope.ownerId;
    const { data, error: err } = await supabase.from("menu_items").insert({ ...fields, venue_id }).select("*").single();
    setBusy(false);
    if (err || !data) return setError("That did not save. Try again.");
    const first = rows.length === 0;
    setRows((rs) => [...rs, data as MenuItem]);
    if (first) {
      setParty(true);
      setTimeout(() => setParty(false), 1600);
    }
    if (another) {
      setDraft({ ...blank(draft.category), everywhere: draft.everywhere });
      say(`Added ${name}. Next one?`);
    } else {
      setDraft(null);
      say(branched && draft.everywhere ? "Added at every branch" : "Added to your menu");
    }
  }

  async function remove() {
    if (!draft?.id) return;
    if (!confirm(`Take "${draft.name}" off your menu?`)) return;
    setBusy(true);
    const { error: err } = await supabase.from("menu_items").delete().eq("id", draft.id);
    setBusy(false);
    if (err) return setError("That did not remove. Try again.");
    setRows((rs) => rs.filter((r) => r.id !== draft.id));
    setDraft(null);
    say("Removed");
  }

  const prices = rows.map((r) => Number(r.price_ghs)).filter((n) => n > 0);

  return (
    <div>
      {party ? (
        <div className="pointer-events-none fixed inset-x-0 top-1/3 z-[70]">
          <Confetti />
        </div>
      ) : null}

      <div className="pl-up mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Menu</h1>
          <p className="mt-1 text-[15px] text-[var(--p-muted)]">
            {rows.length
              ? `${rows.length} item${rows.length === 1 ? "" : "s"}${prices.length ? ` · GHS ${Math.min(...prices)} to ${Math.max(...prices)}` : ""}`
              : "What you serve, and what it costs."}
          </p>
        </div>
        {rows.length ? (
          <div className="hidden md:block">
            <button type="button" className="pl-btn" onClick={openNew}>
              <IconPlus size={20} /> Add a dish
            </button>
          </div>
        ) : null}
      </div>

      {branched ? (
        <div className="pl-up mb-4 rounded-2xl bg-[var(--p-sunken)] px-4 py-3 text-[14px] leading-snug text-[var(--p-ink-2)]" style={{ animationDelay: "40ms" }}>
          This menu is shared by all {scope.branchCount} branches. A change here shows everywhere, unless you add a dish to {scope.venueName} only.
        </div>
      ) : null}

      {unpriced ? (
        <div className="pl-up mb-4 flex items-start gap-3 rounded-2xl bg-[var(--p-warn-soft)] px-4 py-3 text-[14px] text-[var(--p-warn)]" style={{ animationDelay: "60ms" }}>
          <IconWarn className="mt-0.5 shrink-0" />
          <span>
            <b>{unpriced === 1 ? "One item has" : `${unpriced} items have`} no price.</b> Plans leave them out. Tap one to add its price.
          </span>
        </div>
      ) : null}

      {!rows.length ? (
        <div className="pl-card pl-up flex flex-col items-center px-6 py-10 text-center" style={{ animationDelay: "80ms" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascots/scene_table.png" alt="" className="pl-float h-28 w-28 [image-rendering:pixelated]" />
          <h2 className="mt-4 text-[22px] font-bold">Your menu is empty</h2>
          <p className="mt-2 max-w-[400px] text-[15px] leading-relaxed text-[var(--p-muted)]">
            Every plan has a budget, so Duro only sends people to places with prices. Add your dishes and you can start showing up.
          </p>
          <button type="button" className="pl-btn mt-6" onClick={openNew}>
            <IconPlus size={20} /> Add your first dish
          </button>
          <p className="mt-5 max-w-[360px] text-[13.5px] text-[var(--p-muted)]">
            Got a long menu? Send us a photo or PDF of it at{" "}
            <a className="font-bold text-[var(--p-accent)] underline" href={`mailto:planbyaduro@gmail.com?subject=${encodeURIComponent(`Menu for ${scope.venueName}`)}`}>
              planbyaduro@gmail.com
            </a>{" "}
            and we&apos;ll type it in for you.
          </p>
        </div>
      ) : (
        <>
          {/* ── Find ── */}
          <div className="pl-up sticky top-16 z-20 -mx-4 mb-4 bg-[rgb(251_247_244/0.92)] px-4 pb-3 pt-1 backdrop-blur-md md:-mx-6 md:px-6" style={{ animationDelay: "80ms" }}>
            <div className="relative">
              <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--p-muted)]" />
              <input className="pl-input !pl-12" placeholder="Find a dish" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
              <button type="button" className="pl-chip !min-h-[40px] shrink-0 !text-[14px]" aria-pressed={course === "all"} onClick={() => setCourse("all")}>
                All · {rows.length}
              </button>
              {COURSES.filter((c) => counts.get(c.value)).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="pl-chip !min-h-[40px] shrink-0 !text-[14px]"
                  aria-pressed={course === c.value}
                  onClick={() => setCourse(c.value)}
                >
                  {c.emoji} {c.label} · {counts.get(c.value)}
                </button>
              ))}
            </div>
          </div>

          {!groups.length ? (
            <p className="pl-fade py-10 text-center text-[15px] text-[var(--p-muted)]">Nothing matches &ldquo;{query}&rdquo;.</p>
          ) : null}

          <div className="flex flex-col gap-6">
            {groups.map((g, gi) => (
              <section key={g.value} className="pl-up" style={{ animationDelay: `${100 + gi * 50}ms` }}>
                <h2 className="mb-2 flex items-center gap-2 text-[17px] font-bold">
                  <span>{g.emoji}</span> {g.label}
                  <span className="text-[14px] font-semibold text-[var(--p-muted)]">{g.items.length}</span>
                </h2>
                <div className="pl-card divide-y divide-[var(--p-line)] overflow-hidden">
                  {g.items.map((r) => {
                    const onlyHere = branched && r.venue_id === scope.venueId && scope.ownerId !== scope.venueId;
                    const priced = Number(r.price_ghs) > 0;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => openEdit(r)}
                        className="pl-tap flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--p-sunken)]"
                      >
                        {r.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        ) : (
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--p-sunken)] text-[22px]">{g.emoji}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15.5px] font-semibold">
                            {r.name}
                            {r.is_alcoholic ? <span className="ml-1.5 text-[12px] font-bold text-[var(--p-muted)]">18+</span> : null}
                          </span>
                          {r.notes ? <span className="block truncate text-[13px] text-[var(--p-muted)]">{r.notes}</span> : null}
                          {onlyHere ? <span className="mt-0.5 inline-block rounded-full bg-[var(--p-sunken)] px-2 text-[11.5px] font-bold text-[var(--p-ink-2)]">This branch only</span> : null}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-[14.5px] font-bold tabular-nums ${
                            priced ? "bg-[var(--p-ok-soft)] text-[var(--p-ok)]" : "bg-[var(--p-warn-soft)] text-[var(--p-warn)]"
                          }`}
                        >
                          {priced ? `GHS ${Number(r.price_ghs).toLocaleString()}` : "Add price"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* On a phone, the add button floats above the tab bar. */}
          <button
            type="button"
            aria-label="Add a dish"
            onClick={openNew}
            className="pl-pop pl-tap fixed bottom-[92px] right-4 z-30 grid h-16 w-16 place-items-center rounded-[22px] bg-[var(--p-accent)] text-white shadow-[0_12px_24px_-10px_rgb(201_44_88/0.8)] transition-transform active:scale-95 md:hidden"
          >
            <IconPlus size={30} />
          </button>
        </>
      )}

      <Sheet open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? "Edit dish" : "Add a dish"}>
        {draft ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <label className="block">
              <span className="pl-label">What is it called?</span>
              <input
                className="pl-input"
                value={draft.name}
                autoFocus={!draft.id}
                placeholder="Jollof with grilled chicken"
                onChange={(e) => set("name", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="pl-label">Price</span>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-[var(--p-muted)]">GHS</span>
                <input
                  className="pl-input pl-input-big !pl-[70px] tabular-nums"
                  inputMode="decimal"
                  value={draft.price}
                  placeholder="0"
                  onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))}
                />
              </div>
            </label>

            <div>
              <span className="pl-label">Which part of the menu?</span>
              <div className="flex flex-wrap gap-2">
                {COURSES.map((c) => (
                  <button key={c.value} type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={draft.category === c.value} onClick={() => set("category", c.value)}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>

            {draft.category === "drink" ? (
              <div className="pl-fade">
                <span className="pl-label">Does it have alcohol in it?</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: true, l: "Yes" },
                    { v: false, l: "No" },
                    { v: null, l: "Not sure" },
                  ].map((o) => (
                    <button key={o.l} type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={draft.alcoholic === o.v} onClick={() => set("alcoholic", o.v)}>
                      {o.l}
                    </button>
                  ))}
                </div>
                <p className="pl-hint mt-1.5">So we never put a cocktail in the plan of somebody who doesn&apos;t drink.</p>
              </div>
            ) : null}

            <label className="block">
              <span className="pl-label">
                Description <span className="font-semibold text-[var(--p-muted)]">· optional</span>
              </span>
              <textarea
                className="pl-input !min-h-[84px]"
                maxLength={400}
                value={draft.notes}
                placeholder="Smoky party jollof, quarter chicken and shito. Serves one."
                onChange={(e) => set("notes", e.target.value)}
              />
            </label>

            <div>
              <span className="pl-label">
                Picture <span className="font-semibold text-[var(--p-muted)]">· optional</span>
              </span>
              <PosterUpload value={draft.image} onChange={(u) => set("image", u)} folder="menu" label="Add a photo of it" hint="People see it when they tap the dish." aspect="aspect-[16/9]" />
            </div>

            {branched && !draft.id ? (
              <div>
                <span className="pl-label">Where is it served?</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={draft.everywhere} onClick={() => set("everywhere", true)}>
                    All {scope.branchCount} branches
                  </button>
                  <button type="button" className="pl-chip !min-h-[40px] !text-[14px]" aria-pressed={!draft.everywhere} onClick={() => set("everywhere", false)}>
                    {scope.venueName} only
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="pl-fade text-[14px] font-semibold text-[var(--p-accent-dark)]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2.5">
              <button type="submit" className="pl-btn w-full" disabled={busy}>
                {busy ? "Saving…" : draft.id ? "Save" : "Add to menu"}
              </button>
              {!draft.id ? (
                <button type="button" className="pl-btn-soft w-full" disabled={busy} onClick={() => void save(true)}>
                  Add, then another
                </button>
              ) : (
                <button type="button" className="py-2 text-[14.5px] font-bold text-[#b42318]" disabled={busy} onClick={() => void remove()}>
                  Take it off the menu
                </button>
              )}
            </div>
          </form>
        ) : null}
      </Sheet>
      {toast}
    </div>
  );
}
