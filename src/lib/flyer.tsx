import React from "react";
import { ImageResponse } from "next/og";
import { OG_MARK, OG_WORDMARK } from "./brandImages";

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

/** The brand faces (OFL), from public/fonts/og: the generator's own font has no bold. */
async function fonts(origin: string) {
  const load = async (file: string) => (await fetch(`${origin}/fonts/og/${file}`)).arrayBuffer();
  const [regular, bold, display] = await Promise.all([load("Figtree_400Regular.ttf"), load("Figtree_700Bold.ttf"), load("BricolageGrotesque_800ExtraBold.ttf")]);
  return [
    { name: "Figtree", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Figtree", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Bricolage", data: display, weight: 800 as const, style: "normal" as const },
  ];
}

/** The cedi sign is missing from these fonts, so prices read "GHS 50". */
export const cedis = (t: string | undefined | null) => (t ? t.replace(/GH₵\s?/g, "GHS ") : "");
const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

export async function renderFlyer(spec: FlyerSpec, origin: string): Promise<ImageResponse> {
  const size = SIZES[spec.format] ?? SIZES.post;
  const t = THEMES[spec.theme] ?? THEMES.rose;
  const pad = 72;
  const footH = spec.format === "square" ? 120 : 140;

  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: footH, padding: `0 ${pad}px`, background: t.foot, width: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={OG_WORDMARK} width={176} height={64} />
      <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#FFFFFF" }}>{cut(spec.cta || "Plan it on the Duro! app", 40)}</div>
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
    /*
     * The title on one line when it fits, else two, and never wider than the
     * page: Bricolage's heavy face runs about 0.6 of its size a letter.
     */
    const titleMax = spec.format === "square" ? 130 : 160;
    const across = size.width - pad * 2;
    const fits = (chars: number, px: number) => chars * px * 0.6 <= across;
    const oneLine = `${spec.title} ${spec.title2 ?? ""}`.trim().length;
    const twoLines = !fits(oneLine, titleMax);
    const longest = twoLines ? Math.max(spec.title.length, (spec.title2 ?? "").length) : oneLine;
    const titleSize = Math.min(twoLines ? Math.round(titleMax * 0.8) : titleMax, Math.floor(across / (Math.max(longest, 1) * 0.6)));
    body = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: `${pad}px ${pad}px ${pad - 20}px`, position: "relative" }}>
        {spec.eyebrow ? <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: t.text, marginBottom: 18 }}>{cut(spec.eyebrow, 40)}</div> : null}
        <div
          style={{
            display: "flex",
            flexDirection: twoLines ? "column" : "row",
            fontFamily: "Bricolage",
            fontSize: titleSize,
            lineHeight: 0.95,
            letterSpacing: -4,
            marginBottom: 46,
          }}
        >
          <span style={{ color: t.text, marginRight: twoLines ? 0 : 28 }}>{cut(spec.title, 22)}</span>
          {spec.title2 ? <span style={{ color: t.ink }}>{cut(spec.title2, 22)}</span> : null}
        </div>
        {spec.sections.map((s, si) => (
          <div key={si} style={{ display: "flex", flexDirection: "column", marginTop: si ? 26 : 0 }}>
            {s.heading ? <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: t.text, marginBottom: 12 }}>{s.heading.toUpperCase()}</div> : null}
            {s.rows.map((r, ri) => (
              <div key={ri} style={{ display: "flex", alignItems: "center", height: rowH, borderBottom: `2px solid ${t.rule}` }}>
                <div style={{ display: "flex", width: Math.round(big * 6.4), fontSize: big, fontWeight: 700, color: t.ink, letterSpacing: -1 }}>{cut(r.date, 11)}</div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", fontSize: big, fontWeight: 700, color: t.text, letterSpacing: -1, whiteSpace: "nowrap" }}>{cut(r.title, 34)}</div>
                  {withSub && r.sub ? <div style={{ display: "flex", fontSize: Math.round(big * 0.6), color: t.soft, whiteSpace: "nowrap" }}>{cut(cedis(r.sub), 52)}</div> : null}
                </div>
                {r.day ? <div style={{ display: "flex", fontSize: Math.round(big * 0.62), fontWeight: 700, color: t.text, marginLeft: 16 }}>{r.day}</div> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  } else if (spec.layout === "photo") {
    const photoH = Math.round(size.height * (spec.format === "square" ? 0.52 : 0.58));
    body = (
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", position: "relative", width: size.width, height: photoH }}>
          {spec.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={spec.image} alt="" width={size.width} height={photoH} style={{ width: size.width, height: photoH, objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: size.width, height: photoH, background: t.foot }} />
          )}
          {spec.badge ? (
            <div style={{ display: "flex", position: "absolute", top: 48, left: pad, padding: "14px 28px", borderRadius: 999, background: t.bg, color: t.text, fontSize: 30, fontWeight: 700 }}>
              {cut(spec.badge, 40)}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: `${pad - 16}px ${pad}px`, flex: 1, position: "relative" }}>
          {spec.eyebrow ? <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: t.ink, marginBottom: 10 }}>{cut(spec.eyebrow, 44)}</div> : null}
          <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: spec.title.length > 26 ? 70 : 92, lineHeight: 0.98, letterSpacing: -3, color: t.text }}>{cut(spec.title, 60)}</div>
          {spec.sub ? <div style={{ display: "flex", fontSize: 36, color: t.soft, marginTop: 18 }}>{cut(cedis(spec.sub), 70)}</div> : null}
          {spec.chip ? (
            <div style={{ display: "flex", marginTop: 26 }}>
              <div style={{ display: "flex", padding: "14px 30px", borderRadius: 999, background: t.chip, color: t.chipText, fontSize: 34, fontWeight: 700 }}>{cut(cedis(spec.chip), 40)}</div>
            </div>
          ) : null}
        </div>
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: pad, position: "relative" }}>
        {spec.eyebrow ? <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: t.text, marginBottom: 22 }}>{cut(spec.eyebrow, 44)}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Bricolage", fontSize: (spec.title + (spec.title2 ?? "")).length > 24 ? 112 : 150, lineHeight: 0.95, letterSpacing: -4 }}>
          <span style={{ color: t.text }}>{cut(spec.title, 40)}</span>
          {spec.title2 ? <span style={{ color: t.ink }}>{cut(spec.title2, 40)}</span> : null}
        </div>
        {spec.body ? <div style={{ display: "flex", fontSize: 42, lineHeight: 1.3, color: t.soft, marginTop: 40, maxWidth: 900 }}>{cut(cedis(spec.body), 220)}</div> : null}
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
    { width: size.width, height: size.height, fonts: await fonts(origin) }
  );
}
