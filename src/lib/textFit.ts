/*
 * Text that fits, measured with the real font (owner, 22 Nov 2026: flyer
 * text ran off the right side of the card).
 *
 * The flyer renderer (flyer.tsx) cannot ask the browser how wide a line is,
 * so it guessed from the number of letters, and long names were cut off at
 * the edge. This reads each letter's width from the font file itself (the
 * TrueType hmtx and cmap tables) and lays text out ahead of time: the largest
 * size at which it fits in the lines allowed, then smaller, and only at the
 * smallest an ellipsis. The caller draws the lines exactly as given, one per
 * row, so the renderer never wraps differently.
 */

export interface FontMetrics {
  /** Advance width of one character, as a fraction of the font size. */
  em: (codePoint: number) => number;
}

/** The advance widths of a TrueType/OpenType (glyf or CFF) font. */
export function readFont(buf: ArrayBuffer): FontMetrics {
  const v = new DataView(buf);
  const tables: Record<string, number> = {};
  const count = v.getUint16(4);
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    tables[tag] = v.getUint32(o + 8);
  }
  const upm = v.getUint16(tables.head + 18);
  const nHMetrics = v.getUint16(tables.hhea + 34);
  const advance = (glyph: number) => v.getUint16(tables.hmtx + 4 * Math.min(glyph, nHMetrics - 1));

  // The Unicode cmap: format 12 (full range) when there is one, else format 4 (BMP).
  let sub = -1;
  let format = 0;
  const cmap = tables.cmap;
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const platform = v.getUint16(cmap + 4 + i * 8);
    const encoding = v.getUint16(cmap + 6 + i * 8);
    const at = cmap + v.getUint32(cmap + 8 + i * 8);
    const f = v.getUint16(at);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (f === 12) {
      sub = at;
      format = 12;
      break;
    }
    if (f === 4 && format !== 4) {
      sub = at;
      format = 4;
    }
  }

  const glyphOf = (cp: number): number => {
    if (format === 12) {
      const groups = v.getUint32(sub + 12);
      for (let i = 0; i < groups; i++) {
        const g = sub + 16 + i * 12;
        const start = v.getUint32(g);
        const end = v.getUint32(g + 4);
        if (cp >= start && cp <= end) return v.getUint32(g + 8) + (cp - start);
      }
      return 0;
    }
    if (format === 4 && cp <= 0xffff) {
      const segX2 = v.getUint16(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        if (cp > v.getUint16(ends + s)) continue;
        const start = v.getUint16(starts + s);
        if (cp < start) return 0;
        const delta = v.getInt16(deltas + s);
        const ro = v.getUint16(ranges + s);
        if (!ro) return (cp + delta) & 0xffff;
        const g = v.getUint16(ranges + s + ro + 2 * (cp - start));
        return g ? (g + delta) & 0xffff : 0;
      }
    }
    return 0;
  };

  const cache = new Map<number, number>();
  return {
    em: (cp) => {
      let w = cache.get(cp);
      if (w === undefined) {
        const g = glyphOf(cp);
        // A character the font lacks is drawn from elsewhere (emoji, mostly): call it a full em.
        w = g ? advance(g) / upm : 1;
        cache.set(cp, w);
      }
      return w;
    },
  };
}

export interface Face {
  metrics: FontMetrics;
  /** letterSpacing as a fraction of the size (draw it as spacing × size px). */
  spacing?: number;
}

/** Width in px of one line at a size. */
export function lineWidth(text: string, px: number, face: Face): number {
  let w = 0;
  let n = 0;
  for (const ch of text) {
    w += face.metrics.em(ch.codePointAt(0)!) * px;
    n += 1;
  }
  return w + (face.spacing ?? 0) * px * n;
}

/** Greedy word wrap; a word wider than the line is broken by letters. */
function wrap(text: string, px: number, face: Face, width: number): { lines: string[]; broke: boolean } {
  const lines: string[] = [];
  let broke = false;
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const tryLine = line ? `${line} ${word}` : word;
    if (lineWidth(tryLine, px, face) <= width) {
      line = tryLine;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (lineWidth(line, px, face) > width) {
      broke = true;
      let cut = line.length - 1;
      while (cut > 1 && lineWidth(line.slice(0, cut), px, face) > width) cut -= 1;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  return { lines, broke };
}

/** The line, shortened with an ellipsis until it fits. */
export function ellipsize(text: string, px: number, face: Face, width: number): string {
  if (lineWidth(text, px, face) <= width) return text;
  let t = text;
  while (t.length > 1 && lineWidth(`${t.trimEnd()}…`, px, face) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export interface Fitted {
  size: number;
  lines: string[];
  /** True when the text did not fit whole and was shortened. */
  cut: boolean;
}

/**
 * The largest size from max down to min at which the text fits in at most
 * `lines` lines without breaking a word; failing that, the smallest size with
 * the last line ellipsised.
 */
export function fitText(
  text: string,
  o: { face: Face; width: number; max: number; min: number; lines?: number; step?: number },
): Fitted {
  const maxLines = o.lines ?? 1;
  const width = o.width * 0.98; // kerning and rounding: never right up to the edge
  const step = o.step ?? 2;
  const clean = text.replace(/\s+/g, " ").trim();
  for (let px = Math.round(o.max); px >= Math.round(o.min); px -= step) {
    const w = wrap(clean, px, o.face, width);
    if (!w.broke && w.lines.length <= maxLines) return { size: px, lines: w.lines, cut: false };
  }
  const px = Math.round(o.min);
  const face = o.face;
  const w = wrap(clean, px, face, width);
  const lines = w.lines.slice(0, maxLines);
  const rest = w.lines.slice(maxLines - 1).join(" ");
  lines[lines.length - 1] = ellipsize(rest, px, face, width);
  return { size: px, lines, cut: true };
}

