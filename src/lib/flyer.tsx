import React from "react";
import { ImageResponse } from "next/og";
import { OG_MARK, OG_WORDMARK } from "./brandImages";
import { fitText, lineWidth, readFont, type Face, type Fitted } from "./textFit";

/*
 * Flyers for Instagram and the WhatsApp Channel (owner, 15 Nov 2026), drawn
 * by one renderer so the weekend post, the lineups and anything the social
 * team makes in the Flyer maker look like one brand.
 *
 * Four layouts:
 * - list: a big two-tone title and a line per date, the shape of a season's
 *   lineup (the owner's reference, a "Party season." poster);
 * - photo: one event or place, its picture on top;
 * - text: an announcement, words only.
 *
 * Pictures are never a URL from the request: the caller resolves a venue or
 * event to its own catalogue photo (socialPosts.ts), so a flyer can only
 * show what Duro! already holds.
 *
 * Every line of text is measured with the real font and laid out before it
 * is drawn (textFit.ts): the largest size that fits, a second line where
 * there is room, an ellipsis only at the smallest size. Nothing runs off the
 * card (owner, 22 Nov 2026).
 */

export type FlyerTheme = "rose" | "night" | "gold" | "green";
export type FlyerFormat = "post" | "story" | "square";

export interface FlyerRow {
  /** "20 Nov", "26–27 Dec". */
  date: string;
  title: string;
  /** The day, at the right: "Fri", "Sat–Sun". */
  day?: string;
  /** A smaller line under the title: where, the price. */
  sub?: string;
}

export interface FlyerSection {
  /** "NOVEMBER"; blank for none. */
  heading?: string;
  rows: FlyerRow[];
}

interface Common {
  theme: FlyerTheme;
  format: FlyerFormat;
  /** The small line above the title: "Nov – Dec 2026". */
  eyebrow?: string;
  /** The footer's line. */
  cta?: string;
}

export type FlyerSpec =
  | (Common & { layout: "list"; title: string; title2?: string; sections: FlyerSection[] })
  | (Common & { layout: "photo"; title: string; sub?: string; chip?: string; badge?: string; image?: string | null })
  | (Common & { layout: "text"; title: string; title2?: string; body?: string });

export const SIZES: Record<FlyerFormat, { width: number; height: number; label: string }> = {
  post: { width: 1080, height: 1350, label: "Post 4:5" },
  story: { width: 1080, height: 1920, label: "Story 9:16" },
  square: { width: 1080, height: 1080, label: "Square" },
};

/** bg: the page; ink: the title's second word and dates; text: everything else; accent: chips and rules. */
export const THEMES: Record<FlyerTheme, { label: string; bg: string; ink: string; text: string; soft: string; rule: string; chip: string; chipText: string; foot: string }> = {
  rose: { label: "Duro rose", bg: "#E11D48", ink: "#14060B", text: "#FFFFFF", soft: "rgba(255,255,255,0.78)", rule: "rgba(20,6,11,0.16)", chip: "#14060B", chipText: "#FFFFFF", foot: "#14060B" },
  night: { label: "Night", bg: "#0C0A16", ink: "#FF4D7A", text: "#FFFFFF", soft: "rgba(255,255,255,0.7)", rule: "rgba(255,255,255,0.12)", chip: "#FFB547", chipText: "#0C0A16", foot: "#000000" },
  gold: { label: "Gold", bg: "#F2C14E", ink: "#B4232F", text: "#12100C", soft: "rgba(18,16,12,0.72)", rule: "rgba(18,16,12,0.16)", chip: "#12100C", chipText: "#F2C14E", foot: "#12100C" },
  green: { label: "Green", bg: "#1F7A4D", ink: "#F2C14E", text: "#FFFFFF", soft: "rgba(255,255,255,0.78)", rule: "rgba(255,255,255,0.16)", chip: "#F2C14E", chipText: "#12100C", foot: "#0B2E1D" },
};

/** The brand faces (OFL), from public/fonts/og: the generator's own font has no bold. Measured too (textFit.ts). */
async function fonts(origin: string) {
  const load = async (file: string) => (await fetch(`${origin}/fonts/og/${file}`)).arrayBuffer();
  const [regular, bold, display] = await Promise.all([load("Figtree_400Regular.ttf"), load("Figtree_700Bold.ttf"), load("BricolageGrotesque_800ExtraBold.ttf")]);
  return {
    list: [
      { name: "Figtree", data: regular, weight: 400 as const, style: "normal" as const },
      { name: "Figtree", data: bold, weight: 700 as const, style: "normal" as const },
      { name: "Bricolage", data: display, weight: 800 as const, style: "normal" as const },
    ],
    regular: readFont(regular),
    bold: readFont(bold),
    display: readFont(display),
  };
}

/** The cedi sign is missing from these fonts, so prices read "GHS 50". */
export const cedis = (t: string | undefined | null) => (t ? t.replace(/GH₵\s?/g, "GHS ") : "");
/** "#E11D48" at an opacity, for gradients: the renderer wants rgba, not 8-digit hex. */
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Letter spacing as a share of the size, matching what the measuring assumes. */
const DISPLAY_SPACING = -0.027;
const ROW_SPACING = -0.015;

/**
 * Fitted text, drawn exactly as laid out: one row per line, never wrapped
 * again by the renderer, so nothing can run past the edge.
 */
function Lines({ fit, lineHeight, style, spacing }: { fit: Fitted; lineHeight: number; style?: React.CSSProperties; spacing?: number }) {
  return (
    // The renderer refuses a style key that is present but undefined, so spacing is added only when set.
    <div style={{ display: "flex", flexDirection: "column", fontSize: fit.size, lineHeight, ...(spacing ? { letterSpacing: spacing * fit.size } : {}), ...style }}>
      {fit.lines.map((l, i) => (
        <div key={i} style={{ display: "flex", whiteSpace: "nowrap" }}>
          {l}
        </div>
      ))}
    </div>
  );
}

export async function renderFlyer(spec: FlyerSpec, origin: string): Promise<ImageResponse> {
  const size = SIZES[spec.format] ?? SIZES.post;
  const t = THEMES[spec.theme] ?? THEMES.rose;
  const pad = 72;
  const across = size.width - pad * 2;
  const footH = spec.format === "square" ? 120 : 140;
  const f = await fonts(origin);
  const display: Face = { metrics: f.display, spacing: DISPLAY_SPACING };
  const bold: Face = { metrics: f.bold };
  const boldTight: Face = { metrics: f.bold, spacing: ROW_SPACING };
  const regular: Face = { metrics: f.regular };

  const wordmarkW = 176;
  const cta = fitText(spec.cta || "Plan it on the Duro! app", { face: bold, width: across - wordmarkW - 32, max: 32, min: 22 });
  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: footH, padding: `0 ${pad}px`, background: t.foot, width: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={OG_WORDMARK} width={wordmarkW} height={64} />
      <Lines fit={cta} lineHeight={1.1} style={{ fontWeight: 700, color: "#FFFFFF" }} />
    </div>
  );

  // The mark, large and faint behind the top right, as the reference's emblem.
  const emblem = (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={OG_MARK} width={620} height={620} style={{ position: "absolute", right: -170, top: -150, opacity: spec.theme === "gold" ? 0.12 : 0.08 }} />
  );

  let body: React.ReactElement;

  if (spec.layout === "list") {
    const rows = spec.sections.reduce((n, s) => n + s.rows.length, 0);
    const heads = spec.sections.filter((s) => s.heading).length;
    // Room for the rows once the title is placed, shared out; never bigger than the reference's.
    const titleH = spec.format === "square" ? 190 : 250;
    const room = size.height - footH - pad * 2 - titleH - (spec.eyebrow ? 50 : 0) - heads * 64;
    // A short list grows to fill the page, up to a size that still reads as a list.
    const rowH = Math.max(46, Math.min(spec.format === "story" ? 170 : spec.format === "square" ? 110 : 140, Math.floor(room / Math.max(rows, 1))));
    const withSub = spec.sections.some((s) => s.rows.some((r) => r.sub)) && rowH >= 76;
    const big = Math.round(rowH * (withSub ? 0.4 : 0.48));
    const subMax = Math.round(big * 0.6);
    const dayMax = Math.round(big * 0.62);

    /*
     * The title: one line in two colours when it fits at a good size, else
     * the two words on two lines at one size, each measured against the page.
     */
    const titleMax = spec.format === "square" ? 130 : 160;
    const gap = 0.3; // the space between the two words, in em
    const w2 = spec.title2 ?? "";
    const oneAt = (px: number) => lineWidth(spec.title, px, display) + (w2 ? gap * px + lineWidth(w2, px, display) : 0);
    let oneSize = titleMax;
    while (oneSize > 40 && oneAt(oneSize) > across * 0.98) oneSize -= 2;
    const oneLine = !w2 || oneSize >= titleMax * 0.75;
    const twoMax = Math.round(titleMax * 0.8);
    const twoFirst = fitText(spec.title, { face: display, width: across, max: twoMax, min: 48 });
    const twoSecond = w2 ? fitText(w2, { face: display, width: across, max: twoMax, min: 48 }) : twoFirst;
    const twoSize = Math.min(twoFirst.size, twoSecond.size);
    const titleA = fitText(spec.title, { face: display, width: across, max: twoSize, min: Math.min(48, twoSize) });
    const titleB = w2 ? fitText(w2, { face: display, width: across, max: twoSize, min: Math.min(48, twoSize) }) : null;

    /*
     * Columns sized to what is in them, the widest date and the widest day,
     * but capped: one "26–27 Dec" should not squeeze every name, so a date or
     * day wider than its column is drawn smaller instead.
     */
    const all = spec.sections.flatMap((s) => s.rows);
    const dateCap = Math.round(across * 0.26);
    const dateText = Math.min(dateCap, Math.ceil(Math.max(0, ...all.map((r) => lineWidth(r.date, big, boldTight)))));
    const dateW = dateText + 28;
    const dayCap = Math.round(across * 0.13);
    const dayText = Math.min(dayCap, Math.ceil(Math.max(0, ...all.map((r) => (r.day ? lineWidth(r.day, dayMax, bold) : 0)))));
    const dayW = all.some((r) => r.day) ? dayText + 20 : 0;
    const titleW = across - dateW - dayW;
    const dateFit = (d: string) => fitText(d, { face: boldTight, width: dateText / 0.98, max: big, min: Math.round(big * 0.55) });
    const dayFit = (d: string) => fitText(d, { face: bold, width: dayText / 0.98, max: dayMax, min: Math.round(dayMax * 0.6) });
    const eyebrow = spec.eyebrow ? fitText(spec.eyebrow, { face: bold, width: across, max: 34, min: 24 }) : null;

    const rowText = (r: FlyerRow) => {
      const subBlock = withSub && r.sub ? Math.round(subMax * 1.25) : 0;
      // One line, as large as fits, down to three quarters of the list's size.
      const single = fitText(r.title, { face: boldTight, width: titleW, max: big, min: Math.round(big * 0.78) });
      let title = single;
      if (single.cut) {
        // Two lines when the row has the height for them, else one with an ellipsis.
        const twoLineMax = Math.min(Math.round(big * 0.85), Math.floor((rowH - 10 - subBlock) / (2 * 1.05)));
        const twoLines =
          twoLineMax >= Math.round(big * 0.55)
            ? fitText(r.title, { face: boldTight, width: titleW, max: twoLineMax, min: Math.round(big * 0.55), lines: 2 })
            : null;
        title = twoLines && !twoLines.cut ? twoLines : fitText(r.title, { face: boldTight, width: titleW, max: Math.round(big * 0.78), min: Math.round(big * 0.66) });
      }
      const sub = withSub && r.sub ? fitText(cedis(r.sub), { face: regular, width: titleW, max: subMax, min: Math.round(subMax * 0.8) }) : null;
      return { title, sub };
    };

    body = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${pad}px ${pad}px ${pad - 20}px`, position: "relative" }}>
        {eyebrow ? <Lines fit={eyebrow} lineHeight={1.1} style={{ fontWeight: 700, color: t.text, marginBottom: 18 }} /> : null}
        {oneLine ? (
          <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: oneSize, lineHeight: 0.95, letterSpacing: DISPLAY_SPACING * oneSize, marginBottom: 46, whiteSpace: "nowrap" }}>
            <span style={{ color: t.text }}>{spec.title}</span>
            {w2 ? <span style={{ color: t.ink, marginLeft: Math.round(gap * oneSize) }}>{w2}</span> : null}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Bricolage", marginBottom: 46 }}>
            <Lines fit={titleA} lineHeight={0.95} spacing={DISPLAY_SPACING} style={{ color: t.text }} />
            {titleB ? <Lines fit={titleB} lineHeight={0.95} spacing={DISPLAY_SPACING} style={{ color: t.ink }} /> : null}
          </div>
        )}
        {spec.sections.map((s, si) => (
          <div key={si} style={{ display: "flex", flexDirection: "column", marginTop: si ? 26 : 0 }}>
            {s.heading ? (
              <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: t.text, marginBottom: 12, whiteSpace: "nowrap" }}>{s.heading.toUpperCase().slice(0, 30)}</div>
            ) : null}
            {s.rows.map((r, ri) => {
              const { title, sub } = rowText(r);
              return (
                <div key={ri} style={{ display: "flex", alignItems: "center", height: rowH, borderBottom: `2px solid ${t.rule}` }}>
                  <div style={{ display: "flex", width: dateW, flexShrink: 0 }}>
                    <Lines fit={dateFit(r.date)} lineHeight={1.05} spacing={ROW_SPACING} style={{ fontWeight: 700, color: t.ink }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", width: titleW, flexShrink: 0 }}>
                    <Lines fit={title} lineHeight={1.05} spacing={ROW_SPACING} style={{ fontWeight: 700, color: t.text }} />
                    {sub ? <Lines fit={sub} lineHeight={1.2} style={{ color: t.soft }} /> : null}
                  </div>
                  {dayW ? (
                    <div style={{ display: "flex", width: dayW, flexShrink: 0, justifyContent: "flex-end" }}>
                      {r.day ? <Lines fit={dayFit(r.day)} lineHeight={1.05} style={{ fontWeight: 700, color: t.text }} /> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else if (spec.layout === "photo") {
    /*
     * The photo runs taller and fades into the flyer's colour, and the words
     * start over the fade, so picture and text are one piece rather than a
     * photo with a block under it (owner, 15 Nov 2026).
     */
    const photoH = Math.round(size.height * (spec.format === "square" ? 0.62 : spec.format === "story" ? 0.74 : 0.68));
    const overlap = Math.round(photoH * 0.3);
    const eyebrow = spec.eyebrow ? fitText(spec.eyebrow, { face: bold, width: across, max: 32, min: 24 }) : null;
    const title = fitText(spec.title, { face: display, width: across, max: spec.format === "square" ? 80 : 92, min: 48, lines: 3 });
    const sub = spec.sub ? fitText(cedis(spec.sub), { face: regular, width: across, max: 36, min: 28, lines: 2 }) : null;
    const chip = spec.chip ? fitText(cedis(spec.chip), { face: bold, width: across - 60, max: 34, min: 24 }) : null;
    const badge = spec.badge ? fitText(spec.badge, { face: bold, width: across - 56, max: 30, min: 22 }) : null;
    body = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", position: "relative", width: size.width, height: photoH }}>
          {spec.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={spec.image} alt="" width={size.width} height={photoH} style={{ width: size.width, height: photoH, objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: size.width, height: photoH, background: t.foot }} />
          )}
          {/* A shade at the top for the badge, and the long fade into the page at the bottom. */}
          <div style={{ display: "flex", position: "absolute", left: 0, right: 0, top: 0, height: 220, background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0))" }} />
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: Math.round(photoH * 0.62),
              background: `linear-gradient(to bottom, ${rgba(t.bg, 0)} 0%, ${rgba(t.bg, 0.55)} 45%, ${rgba(t.bg, 0.92)} 78%, ${rgba(t.bg, 1)} 100%)`,
            }}
          />
          {badge ? (
            <div style={{ display: "flex", position: "absolute", top: 48, left: pad, padding: "14px 28px", borderRadius: 999, background: t.bg, color: t.text, fontWeight: 700 }}>
              <Lines fit={badge} lineHeight={1.1} />
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: `0 ${pad}px ${pad - 16}px`, marginTop: -overlap, flex: 1, position: "relative" }}>
          {eyebrow ? <Lines fit={eyebrow} lineHeight={1.1} style={{ fontWeight: 700, color: t.ink, marginBottom: 10 }} /> : null}
          <Lines fit={title} lineHeight={0.98} spacing={DISPLAY_SPACING} style={{ fontFamily: "Bricolage", color: t.text }} />
          {sub ? <Lines fit={sub} lineHeight={1.25} style={{ color: t.soft, marginTop: 18 }} /> : null}
          {chip ? (
            <div style={{ display: "flex", marginTop: 26 }}>
              <div style={{ display: "flex", padding: "14px 30px", borderRadius: 999, background: t.chip, color: t.chipText, fontWeight: 700 }}>
                <Lines fit={chip} lineHeight={1.1} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  } else {
    const eyebrow = spec.eyebrow ? fitText(spec.eyebrow, { face: bold, width: across, max: 36, min: 24 }) : null;
    const big = (spec.title + (spec.title2 ?? "")).length > 24 ? 112 : 150;
    // Both title lines at one size: the size the longer one needs.
    const a = fitText(spec.title, { face: display, width: across, max: big, min: 56, lines: 2 });
    const b = spec.title2 ? fitText(spec.title2, { face: display, width: across, max: big, min: 56, lines: 2 }) : null;
    const common = Math.min(a.size, b?.size ?? a.size);
    const titleA = fitText(spec.title, { face: display, width: across, max: common, min: Math.min(56, common), lines: 2 });
    const titleB = spec.title2 ? fitText(spec.title2, { face: display, width: across, max: common, min: Math.min(56, common), lines: 2 }) : null;
    const titleLines = titleA.lines.length + (titleB?.lines.length ?? 0);
    // The body gets the height that is left.
    const bodyRoom = size.height - footH - pad * 2 - (eyebrow ? 70 : 0) - titleLines * common * 0.95 - 40;
    const bodyLines = Math.max(2, Math.floor(bodyRoom / (42 * 1.3)));
    const bodyText = spec.body ? fitText(cedis(spec.body), { face: regular, width: Math.min(across, 900), max: 42, min: 30, lines: bodyLines }) : null;
    body = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: pad, position: "relative" }}>
        {eyebrow ? <Lines fit={eyebrow} lineHeight={1.1} style={{ fontWeight: 700, color: t.text, marginBottom: 22 }} /> : null}
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Bricolage" }}>
          <Lines fit={titleA} lineHeight={0.95} spacing={DISPLAY_SPACING} style={{ color: t.text }} />
          {titleB ? <Lines fit={titleB} lineHeight={0.95} spacing={DISPLAY_SPACING} style={{ color: t.ink }} /> : null}
        </div>
        {bodyText ? <Lines fit={bodyText} lineHeight={1.3} style={{ color: t.soft, marginTop: 40 }} /> : null}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: t.bg, color: t.text, fontFamily: "Figtree", position: "relative", overflow: "hidden" }}>
        {spec.layout === "photo" ? null : emblem}
        {body}
        {footer}
      </div>
    ),
    { width: size.width, height: size.height, fonts: f.list }
  );
}
