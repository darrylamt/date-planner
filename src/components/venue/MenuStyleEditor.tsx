"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PosterUpload } from "@/components/planner/PosterUpload";
import { ACCENTS, FONTS, SILHOUETTE, fontStack, fontsHref, palette, type MenuStyle } from "@/lib/menuStyle";

/*
 * How a venue's public menu page looks (0111): logo, cover photo, light or
 * dark, accent colour, a heading font and a body font, with a live preview.
 * Used in the venue portal (Menu → Menu page look) and in the admin.
 */
export function MenuStyleEditor({ venueId, venueName, initial, menuHref }: { venueId: string; venueName: string; initial: MenuStyle; menuHref: string }) {
  const [s, setS] = useState<MenuStyle>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof MenuStyle>(k: K, val: MenuStyle[K]) => setS((cur) => ({ ...cur, [k]: val }));
  const c = palette(s);

  async function save() {
    setBusy(true);
    setNote(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("venue_menu_style").upsert(
      {
        venue_id: venueId,
        logo_url: s.logo_url || null,
        cover_url: s.cover_url || null,
        theme: s.theme,
        accent: s.accent.toUpperCase(),
        heading_font: s.heading_font,
        body_font: s.body_font,
        updated_at: new Date().toISOString(),
        updated_by: auth.user?.id ?? null,
      },
      { onConflict: "venue_id" }
    );
    setBusy(false);
    setNote(
      error
        ? { ok: false, text: /relation|does not exist/i.test(error.message) ? "Menu page styles aren't switched on yet. Try again later." : "Couldn't save. Refresh and try again." }
        : { ok: true, text: "Saved. Your menu page shows it within a day; open it to check." }
    );
  }

  const label = "text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]";
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={fontsHref(FONTS.map((f) => f.name))} />

      <div className="grid gap-6">
        <section className="pl-card grid gap-4 p-5">
          <div className={label}>Logo</div>
          <div className="max-w-[220px]">
            <PosterUpload value={s.logo_url ?? ""} onChange={(u) => set("logo_url", u || null)} folder="venues" label="Add your logo" hint="Square PNG or JPEG works best, up to 5 MB." aspect="aspect-square" />
          </div>
          <div className={label}>Cover photo</div>
          <PosterUpload value={s.cover_url ?? ""} onChange={(u) => set("cover_url", u || null)} folder="venues" label="Add a cover photo" hint="A wide photo of the place or a signature dish. Without one we use your main photo." aspect="aspect-[16/7]" />
        </section>

        <section className="pl-card grid gap-4 p-5">
          <div className={label}>Page</div>
          <div className="flex gap-2">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("theme", t)}
                className={`h-11 flex-1 rounded-xl border-2 px-4 text-[15px] font-bold ${s.theme === t ? "border-[var(--p-ink)]" : "border-[var(--p-line)]"}`}
                style={{ background: t === "light" ? "#FAF6F1" : "#140D10", color: t === "light" ? "#24170F" : "#F6ECEF" }}
              >
                {t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>

          <div className={label}>Accent colour</div>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={`Accent ${a}`}
                onClick={() => set("accent", a)}
                className="h-10 w-10 rounded-full"
                style={{ background: a, outline: s.accent.toUpperCase() === a ? "3px solid var(--p-ink)" : "none", outlineOffset: 2 }}
              />
            ))}
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--p-line)] px-3 text-[14px] font-semibold">
              <input type="color" value={s.accent} onChange={(e) => set("accent", e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" />
              Your own
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className={label}>Headings font</span>
              <select value={s.heading_font} onChange={(e) => set("heading_font", e.target.value)} className="h-11 rounded-xl border border-[var(--p-line)] bg-white px-3 text-[15px]" style={{ fontFamily: fontStack(s.heading_font) }}>
                {FONTS.map((f) => (
                  <option key={f.name} value={f.name} style={{ fontFamily: fontStack(f.name) }}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={label}>Text font</span>
              <select value={s.body_font} onChange={(e) => set("body_font", e.target.value)} className="h-11 rounded-xl border border-[var(--p-line)] bg-white px-3 text-[15px]" style={{ fontFamily: fontStack(s.body_font) }}>
                {FONTS.filter((f) => f.kind === "sans" || f.kind === "serif").map((f) => (
                  <option key={f.name} value={f.name} style={{ fontFamily: fontStack(f.name) }}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy} className="pl-btn h-12 rounded-xl bg-[var(--p-ink)] px-6 text-[15px] font-bold text-white disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
          <a href={menuHref} target="_blank" rel="noopener" className="h-12 rounded-xl border border-[var(--p-line)] px-5 text-[15px] font-bold leading-[48px]">
            Open your menu page
          </a>
          {note ? <span className={`text-[14px] font-semibold ${note.ok ? "text-emerald-700" : "text-red-700"}`}>{note.text}</span> : null}
        </div>
      </div>

      {/* Live preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className={`${label} mb-2`}>Preview</div>
        <div className="overflow-hidden rounded-[24px] border border-[var(--p-line)]" style={{ background: c.bg, color: c.ink, fontFamily: fontStack(s.body_font) }}>
          <div className="relative h-[140px]" style={{ background: s.cover_url ? undefined : `radial-gradient(120% 120% at 15% 0%, ${s.accent}55, transparent 60%)` }}>
            {s.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.cover_url} alt="" className="h-full w-full object-cover" />
            ) : null}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }} />
            <div className="absolute bottom-3 left-3 flex items-end gap-2">
              {s.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo_url} alt="" className="h-10 w-10 rounded-xl border-2 border-white/80 object-cover" />
              ) : null}
              <div className="text-[24px] font-extrabold leading-none text-white" style={{ fontFamily: fontStack(s.heading_font) }}>
                {venueName}
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="text-[28px] font-extrabold" style={{ fontFamily: fontStack(s.heading_font) }}>
              Menu
            </div>
            <div className="mt-2 flex gap-1.5">
              {["Mains", "Drinks", "Desserts"].map((t) => (
                <span key={t} className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: s.accent, color: "#fff" }}>
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { n: "Grilled tilapia", d: "With banku and pepper", p: "GH₵180", k: "main" },
                { n: "Sobolo", d: "Hibiscus and ginger", p: "GH₵35", k: "drink" },
              ].map((x) => (
                <div key={x.n} className="rounded-2xl p-2" style={{ background: c.tint }}>
                  <div className="flex aspect-square items-center justify-center rounded-xl" style={{ background: c.surface }}>
                    <svg viewBox="0 0 64 64" className="h-1/2 w-1/2" aria-hidden="true">
                      <path d={SILHOUETTE[x.k]} fill={`${s.accent}40`} fillRule="evenodd" />
                    </svg>
                  </div>
                  <div className="px-1 pt-2 text-[13px] font-bold">{x.n}</div>
                  <div className="px-1 text-[11px]" style={{ color: c.muted }}>
                    {x.d}
                  </div>
                  <div className="px-1 pt-1 text-[14px] font-extrabold" style={{ color: s.accent }}>
                    {x.p}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
