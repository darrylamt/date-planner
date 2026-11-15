"use client";

import { useEffect, useMemo, useState } from "react";
import { flyerParam } from "@/lib/flyerLink";
import { CopyBox } from "@/components/admin/CopyBox";

export type PhotoChoice = { kind: "event" | "venue"; id: string; label: string };

type Layout = "list" | "photo" | "text";
type Row = { date: string; title: string; day: string; sub: string };
type Section = { heading: string; rows: Row[] };

const THEMES = [
  { id: "rose", label: "Duro rose", swatch: "#E11D48" },
  { id: "night", label: "Night", swatch: "#0C0A16" },
  { id: "gold", label: "Gold", swatch: "#F2C14E" },
  { id: "green", label: "Green", swatch: "#1F7A4D" },
] as const;
const FORMATS = [
  { id: "post", label: "Post 4:5", aspect: "aspect-[4/5]" },
  { id: "story", label: "Story 9:16", aspect: "aspect-[9/16]" },
  { id: "square", label: "Square", aspect: "aspect-square" },
] as const;
const LAYOUTS: { id: Layout; label: string; hint: string }[] = [
  { id: "list", label: "Lineup", hint: "A big title and a line per date." },
  { id: "photo", label: "Event or place", hint: "One photo from Duro!, a title and a price." },
  { id: "text", label: "Announcement", hint: "Words only." },
];

const blankRow = (): Row => ({ date: "", title: "", day: "", sub: "" });

/*
 * The Flyer maker's form and live preview. Everything is held as one spec
 * and sent to /api/flyer, which draws the same picture the download gives.
 * The preview waits half a second after typing, so it is not redrawn per key.
 */
function Editor({ photos, initial }: { photos: PhotoChoice[]; initial: unknown }) {
  const start = (initial ?? {}) as Record<string, unknown>;
  const [layout, setLayout] = useState<Layout>((["list", "photo", "text"] as const).find((l) => l === start.layout) ?? "list");
  const [theme, setTheme] = useState<string>(typeof start.theme === "string" ? start.theme : "rose");
  const [format, setFormat] = useState<string>(typeof start.format === "string" ? start.format : "post");
  const [eyebrow, setEyebrow] = useState(typeof start.eyebrow === "string" ? start.eyebrow : "");
  const [title, setTitle] = useState(typeof start.title === "string" ? start.title : "Party");
  const [title2, setTitle2] = useState(typeof start.title2 === "string" ? start.title2 : "season.");
  const [cta, setCta] = useState(typeof start.cta === "string" ? start.cta : "Plan it on the Duro! app");
  const [sections, setSections] = useState<Section[]>(
    Array.isArray(start.sections) && start.sections.length
      ? (start.sections as { heading?: string; rows: Partial<Row>[] }[]).map((s) => ({ heading: s.heading ?? "", rows: s.rows.map((r) => ({ ...blankRow(), ...r })) }))
      : [{ heading: "", rows: [blankRow(), blankRow(), blankRow()] }]
  );
  const [sub, setSub] = useState(typeof start.sub === "string" ? start.sub : "");
  const [chip, setChip] = useState(typeof start.chip === "string" ? start.chip : "");
  const [badge, setBadge] = useState(typeof start.badge === "string" ? start.badge : "");
  const [body, setBody] = useState(typeof start.body === "string" ? start.body : "");
  const [photo, setPhoto] = useState<PhotoChoice | null>(() => {
    const id = typeof start.eventId === "string" ? start.eventId : typeof start.venueId === "string" ? start.venueId : null;
    if (!id) return null;
    return photos.find((p) => p.id === id) ?? { kind: typeof start.eventId === "string" ? "event" : "venue", id, label: "The chosen photo" };
  });
  const [photoQuery, setPhotoQuery] = useState("");

  const spec = useMemo(() => {
    const common = { theme, format, eyebrow: eyebrow || undefined, cta: cta || undefined };
    if (layout === "list") {
      return {
        ...common,
        layout,
        title,
        title2: title2 || undefined,
        sections: sections
          .map((s) => ({
            heading: s.heading || undefined,
            rows: s.rows.filter((r) => r.title.trim()).map((r) => ({ date: r.date, title: r.title, day: r.day || undefined, sub: r.sub || undefined })),
          }))
          .filter((s) => s.rows.length),
      };
    }
    if (layout === "photo") {
      return {
        ...common,
        layout,
        title,
        sub: sub || undefined,
        chip: chip || undefined,
        badge: badge || undefined,
        ...(photo ? (photo.kind === "event" ? { eventId: photo.id } : { venueId: photo.id }) : {}),
      };
    }
    return { ...common, layout, title, title2: title2 || undefined, body: body || undefined };
  }, [layout, theme, format, eyebrow, cta, title, title2, sections, sub, chip, badge, body, photo]);

  const [shown, setShown] = useState(() => flyerParam(spec));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setShown(flyerParam(spec));
      setLoading(true);
    }, 500);
    return () => clearTimeout(t);
  }, [spec]);

  const matches = photoQuery.trim().length >= 2 ? photos.filter((p) => p.label.toLowerCase().includes(photoQuery.trim().toLowerCase())).slice(0, 12) : [];
  const aspect = FORMATS.find((f) => f.id === format)?.aspect ?? "aspect-[4/5]";
  const input = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-[14px]";
  const label = "text-[12px] font-bold uppercase tracking-[0.06em] text-mutedbrown";

  const setRow = (si: number, ri: number, patch: Partial<Row>) =>
    setSections((cur) => cur.map((s, i) => (i === si ? { ...s, rows: s.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) } : s)));

  return (
    <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="grid content-start gap-5">
        <div className="card grid gap-3 p-4">
          <div className={label}>Layout</div>
          <div className="flex flex-wrap gap-2">
            {LAYOUTS.map((l) => (
              <button key={l.id} type="button" onClick={() => setLayout(l.id)} className={layout === l.id ? "btn btnsm" : "btn2 btnsm"} title={l.hint}>
                {l.label}
              </button>
            ))}
          </div>
          <div className={label}>Colour</div>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button key={t.id} type="button" onClick={() => setTheme(t.id)} className={theme === t.id ? "btn btnsm" : "btn2 btnsm"}>
                <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle ring-1 ring-black/20" style={{ background: t.swatch }} />
                {t.label}
              </button>
            ))}
          </div>
          <div className={label}>Size</div>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormat(f.id)} className={format === f.id ? "btn btnsm" : "btn2 btnsm"}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card grid gap-3 p-4">
          <label className="grid gap-1">
            <span className={label}>Small line on top</span>
            <input className={input} value={eyebrow} maxLength={60} onChange={(e) => setEyebrow(e.target.value)} placeholder="Nov – Dec 2026" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className={label}>Title</span>
              <input className={input} value={title} maxLength={layout === "photo" ? 70 : 30} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {layout !== "photo" ? (
              <label className="grid gap-1">
                <span className={label}>Second part, in the other colour</span>
                <input className={input} value={title2} maxLength={30} onChange={(e) => setTitle2(e.target.value)} />
              </label>
            ) : null}
          </div>

          {layout === "photo" ? (
            <>
              <div className="grid gap-1">
                <span className={label}>Photo, from Duro!</span>
                {photo ? (
                  <div className="flex items-center gap-2 text-[14px]">
                    <span className="font-semibold">{photo.label}</span>
                    <button type="button" className="btn2 btnsm" onClick={() => setPhoto(null)}>
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input className={input} value={photoQuery} onChange={(e) => setPhotoQuery(e.target.value)} placeholder="Search an event or a place" />
                    {matches.length ? (
                      <div className="grid gap-1 rounded-lg border border-black/10 bg-white p-1">
                        {matches.map((m) => (
                          <button
                            key={`${m.kind}-${m.id}`}
                            type="button"
                            className="rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-black/[0.04]"
                            onClick={() => {
                              setPhoto(m);
                              setPhotoQuery("");
                              if (!title || title === "Party") setTitle(m.label.split(" · ")[0]);
                            }}
                          >
                            <span className="mr-2 text-[11px] font-bold uppercase text-mutedbrown">{m.kind === "event" ? "Event" : "Place"}</span>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <label className="grid gap-1">
                <span className={label}>Line under the title</span>
                <input className={input} value={sub} maxLength={90} onChange={(e) => setSub(e.target.value)} placeholder="Bella Red Room, Osu · Friday 8pm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className={label}>Price or highlight</span>
                  <input className={input} value={chip} maxLength={50} onChange={(e) => setChip(e.target.value)} placeholder="GHS 50 a person" />
                </label>
                <label className="grid gap-1">
                  <span className={label}>Badge on the photo</span>
                  <input className={input} value={badge} maxLength={50} onChange={(e) => setBadge(e.target.value)} placeholder="This weekend" />
                </label>
              </div>
            </>
          ) : null}

          {layout === "text" ? (
            <label className="grid gap-1">
              <span className={label}>Words</span>
              <textarea className={`${input} min-h-[110px]`} value={body} maxLength={240} onChange={(e) => setBody(e.target.value)} />
            </label>
          ) : null}

          <label className="grid gap-1">
            <span className={label}>Footer</span>
            <input className={input} value={cta} maxLength={50} onChange={(e) => setCta(e.target.value)} />
          </label>
        </div>

        {layout === "list" ? (
          <div className="grid gap-4">
            {sections.map((s, si) => (
              <div key={si} className="card grid gap-2 p-4">
                <div className="flex items-center gap-2">
                  <input className={input} value={s.heading} maxLength={20} placeholder="Heading, e.g. DECEMBER (optional)" onChange={(e) => setSections((cur) => cur.map((x, i) => (i === si ? { ...x, heading: e.target.value } : x)))} />
                  {sections.length > 1 ? (
                    <button type="button" className="btn2 btnsm" onClick={() => setSections((cur) => cur.filter((_, i) => i !== si))}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="hidden grid-cols-[110px_1fr_80px_1fr_32px] gap-2 text-[11px] font-bold uppercase text-mutedbrown sm:grid">
                  <span>Date</span>
                  <span>Name</span>
                  <span>Day</span>
                  <span>Small line</span>
                  <span />
                </div>
                {s.rows.map((r, ri) => (
                  <div key={ri} className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_1fr_80px_1fr_32px]">
                    <input className={input} value={r.date} maxLength={16} placeholder="20 Nov" onChange={(e) => setRow(si, ri, { date: e.target.value })} />
                    <input className={input} value={r.title} maxLength={60} placeholder="Name" onChange={(e) => setRow(si, ri, { title: e.target.value })} />
                    <input className={input} value={r.day} maxLength={12} placeholder="Fri" onChange={(e) => setRow(si, ri, { day: e.target.value })} />
                    <input className={input} value={r.sub} maxLength={80} placeholder="Where · price" onChange={(e) => setRow(si, ri, { sub: e.target.value })} />
                    <button
                      type="button"
                      aria-label="Remove line"
                      className="text-[18px] text-mutedbrown"
                      onClick={() => setSections((cur) => cur.map((x, i) => (i === si ? { ...x, rows: x.rows.filter((_, j) => j !== ri) } : x)))}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn2 btnsm"
                    disabled={sections.reduce((n, x) => n + x.rows.length, 0) >= 24}
                    onClick={() => setSections((cur) => cur.map((x, i) => (i === si ? { ...x, rows: [...x.rows, blankRow()] } : x)))}
                  >
                    + Line
                  </button>
                </div>
              </div>
            ))}
            {sections.length < 4 ? (
              <button type="button" className="btn2 btnsm justify-self-start" onClick={() => setSections((cur) => [...cur, { heading: "", rows: [blankRow()] }])}>
                + Section (a month, say)
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className={`relative overflow-hidden rounded-xl bg-black/5 ring-1 ring-black/10 ${aspect}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/flyer?d=${shown}`} alt="Flyer preview" className="h-full w-full object-cover" onLoad={() => setLoading(false)} onError={() => setLoading(false)} />
          {loading ? <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">Drawing…</div> : null}
        </div>
        <a href={`/api/flyer?d=${shown}&download=1`} className="btn mt-3 w-full justify-center">
          Download PNG
        </a>
        <p className="mt-2 text-[12px] text-mutedbrown">Long names are shortened with … to fit. Prices show as GHS, because the font has no cedi sign.</p>
      </div>
    </div>
  );
}

const QUICK: Record<"venue" | "event", { id: string; label: string; hint: string }[]> = {
  venue: [
    { id: "spotlight", label: "Place spotlight", hint: "Its photo, what it is, two mains from its menu." },
    { id: "menu", label: "Menu with prices", hint: "Its most picked dishes, priced." },
    { id: "datenight", label: "Date night idea", hint: "Its photo and dinner for two." },
  ],
  event: [
    { id: "poster", label: "Event poster", hint: "Its picture, when, where and the price." },
    { id: "savedate", label: "Save the date", hint: "The date, big, and what it is." },
  ],
};

/**
 * The Flyer maker (owner, 15 Nov 2026): first, the quick way. Pick a place
 * or an event and a kind of post, and the flyer and its caption are filled in
 * from Duro!; then change anything below, or start from blank.
 */
export function FlyerMaker({ photos, initial }: { photos: PhotoChoice[]; initial: unknown }) {
  const [seed, setSeed] = useState<{ n: number; spec: unknown; caption: string | null }>({ n: 0, spec: initial, caption: null });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PhotoChoice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState("rose");
  const [format, setFormat] = useState("post");
  const matches = query.trim().length >= 2 ? photos.filter((p) => p.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 10) : [];

  async function make(type: string) {
    if (!picked) return;
    setBusy(type);
    setError(null);
    try {
      const res = await fetch(`/api/admin/social?${new URLSearchParams({ kind: picked.kind, id: picked.id, type, theme, format })}`);
      const json = (await res.json()) as { spec?: unknown; caption?: string; error?: string };
      if (!res.ok || !json.spec) throw new Error(json.error ?? "That did not work.");
      setSeed((s) => ({ n: s.n + 1, spec: json.spec, caption: json.caption ?? null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card mt-5 grid gap-3 p-4">
        <div className="text-[16px] font-bold">Quick flyer</div>
        <p className="text-[13px] text-mutedbrown">Pick a place or an event, then the kind of post. Everything is filled in from Duro!, and the caption tags the place so they can share it.</p>
        {picked ? (
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="rounded-full bg-black/[0.05] px-3 py-1 font-semibold">
              {picked.kind === "event" ? "Event" : "Place"} · {picked.label}
            </span>
            <button type="button" className="btn2 btnsm" onClick={() => setPicked(null)}>
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-[14px]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a restaurant, a bar, an event…"
            />
            {matches.length ? (
              <div className="grid gap-1 rounded-lg border border-black/10 bg-white p-1">
                {matches.map((m) => (
                  <button
                    key={`${m.kind}-${m.id}`}
                    type="button"
                    className="rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-black/[0.04]"
                    onClick={() => {
                      setPicked(m);
                      setQuery("");
                    }}
                  >
                    <span className="mr-2 text-[11px] font-bold uppercase text-mutedbrown">{m.kind === "event" ? "Event" : "Place"}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
        {picked ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold">Colour</span>
              {THEMES.map((t) => (
                <button key={t.id} type="button" onClick={() => setTheme(t.id)} className={theme === t.id ? "btn btnsm" : "btn2 btnsm"}>
                  <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle ring-1 ring-black/20" style={{ background: t.swatch }} />
                  {t.label}
                </button>
              ))}
              <span className="ml-2 font-semibold">Size</span>
              {FORMATS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFormat(f.id)} className={format === f.id ? "btn btnsm" : "btn2 btnsm"}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {QUICK[picked.kind].map((q) => (
                <button key={q.id} type="button" disabled={busy !== null} onClick={() => void make(q.id)} className="rounded-xl border border-black/10 bg-white p-3 text-left hover:border-black/30">
                  <div className="text-[15px] font-bold">{busy === q.id ? "Making…" : q.label}</div>
                  <div className="text-[12px] text-mutedbrown">{q.hint}</div>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {error ? <div className="text-[13px] font-semibold text-red-700">{error}</div> : null}
      </div>

      {seed.caption ? (
        <div className="mt-5">
          <CopyBox title="Caption" text={seed.caption} />
        </div>
      ) : null}

      <div className="mt-6 text-[13px] font-bold uppercase tracking-[0.08em] text-mutedbrown">{seed.n ? "Change anything" : "Or make one from blank"}</div>
      <Editor key={seed.n} photos={photos} initial={seed.spec} />
    </>
  );
}
