/*
 * What colour does admin text actually end up on?
 *
 *   npm run build && npm run contrast
 *
 * Reads the built stylesheet, resolves the cascade the way a browser does --
 * !important first, then specificity, then source order -- and reports the
 * WCAG contrast of every element in the admin and venue portal that sets a
 * text colour, against the background it ends up on.
 *
 * ── why this exists ─────────────────────────────────────────────────────
 * The admin is a light theme laid over a Tailwind build whose every surface
 * token is dark: cream is #1A0D14, shell is #26131D, and sand, parchment,
 * whybg, avoidbg and track are all in the same range. Each one has to be
 * answered in the .admin scope or it paints a near-black panel on a pale grey
 * page, and three rounds of reasoning about which ones were covered produced
 * three wrong answers. Reading the cascade is not a reliable way to know.
 *
 * ── what it will not catch ──────────────────────────────────────────────
 * It resolves one element at a time and assumes anything that sets no
 * background of its own sits on a card, or on the sidebar inside AdminNav. A
 * page that renders outside the .admin wrapper -- the "Admins only" rejection
 * in admin/layout.tsx is the one that exists -- is on the app's own dark
 * theme and will be reported as a false failure. Check the enclosing element
 * before believing a result.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// ── The admin theme's variables ──────────────────────────────────────────
const css = fs
  .readdirSync(path.join(ROOT, ".next/static/css"))
  .filter((f) => f.endsWith(".css"))
  .map((f) => fs.readFileSync(path.join(ROOT, ".next/static/css", f), "utf8"))
  .join("\n");

const vars = {};
const adminBlock = css.match(/\.admin\{([^}]*)\}/);
for (const m of (adminBlock?.[1] ?? "").matchAll(/(--a-[a-z0-9-]+):\s*([^;]+)/g)) {
  vars[m[1]] = m[2].trim();
}

const resolve = (v) => {
  if (!v) return null;
  let out = v.trim();
  for (let i = 0; i < 4; i++) {
    const m = out.match(/var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)/);
    if (!m) break;
    out = out.replace(m[0], vars[m[1]] ?? m[2] ?? "");
  }
  return out.replace(/!important/g, "").trim();
};

// ── Parse rules ──────────────────────────────────────────────────────────
const rules = [];
let order = 0;
for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const selectors = m[1].trim();
  const body = m[2];
  if (selectors.startsWith("@") || !body) continue;
  const bg = body.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/);
  const fg = body.match(/(?:^|;)\s*color:\s*([^;]+)/);
  if (!bg && !fg) continue;
  for (const sel of selectors.split(",")) {
    rules.push({
      sel: sel.trim(),
      bg: bg?.[1]?.trim() ?? null,
      fg: fg?.[1]?.trim() ?? null,
      order: order++,
    });
  }
}

/** Crude but sufficient: count id, class/attr/pseudo-class, and type. */
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const cls =
    (sel.match(/\.[\w\\/-]+/g) || []).length +
    (sel.match(/\[[^\]]+\]/g) || []).length +
    (sel.match(/:(?!:)[a-z-]+/g) || []).length;
  const type = (sel.match(/(?:^|[\s>+~])[a-z][a-z0-9]*/g) || []).length;
  return ids * 10000 + cls * 100 + type;
}

/** Does this selector match an element in .admin carrying these classes? */
function matches(sel, classAttr) {
  // Only the .admin-scoped rules and bare utility classes concern us.
  const scoped = sel.startsWith(".admin ");
  let s = scoped ? sel.slice(7) : sel;
  // Ignore state selectors; we are asking about the resting state.
  if (/:(hover|focus|active|disabled|checked|visited)/.test(s)) return false;
  if (/::/.test(s)) return false;
  s = s.trim();

  /*
   * Attribute selectors come out first, before anything looks for a
   * combinator. `[class*=" text-ink"]` contains a space inside its value, and
   * testing the raw selector for whitespace threw away every boundary rule in
   * the stylesheet -- which made the audit report the exact failure it was
   * written to detect.
   */
  /*
   * Quoted or not. The minifier drops the quotes wherever it can, so the
   * stylesheet actually ships `[class^=text-ink]` next to
   * `[class*=" text-ink"]` -- the second keeps them only because of the
   * space. A regex demanding quotes silently ignored half the rules.
   */
  const ATTR = /\[class([\^*$]?)=(?:"([^"]*)"|([^\]]*))\]/g;
  const attrs = [...s.matchAll(ATTR)].map((m) => [m[1], m[2] !== undefined ? m[2] : m[3]]);
  const withoutAttrs = s.replace(ATTR, "");

  // Descendant combinators beyond one step are out of scope for this check.
  if (/[\s>+~]/.test(withoutAttrs.trim())) return false;

  const classes = [...withoutAttrs.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) =>
    m[1].replace(/\\/g, "")
  );

  if (!attrs.length && !classes.length) return false;

  for (const [op, val] of attrs) {
    if (op === "^" && !classAttr.startsWith(val)) return false;
    if (op === "*" && !classAttr.includes(val)) return false;
    if (op === "$" && !classAttr.endsWith(val)) return false;
    if (op === "" && classAttr !== val) return false;
  }
  const have = new Set(classAttr.split(/\s+/));
  for (const c of classes) if (!have.has(c)) return false;
  return true;
}

function winner(classAttr, prop) {
  let best = null;
  for (const r of rules) {
    const raw = prop === "bg" ? r.bg : r.fg;
    if (!raw) continue;
    if (!matches(r.sel, classAttr)) continue;
    const imp = /!important/.test(raw);
    const spec = specificity(r.sel);
    const key = [imp ? 1 : 0, spec, r.order];
    if (
      !best ||
      key[0] > best.key[0] ||
      (key[0] === best.key[0] && key[1] > best.key[1]) ||
      (key[0] === best.key[0] && key[1] === best.key[1] && key[2] > best.key[2])
    ) {
      best = { key, value: raw, sel: r.sel };
    }
  }
  return best;
}

// ── Colour maths ─────────────────────────────────────────────────────────
function parse(c) {
  if (!c) return null;
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split("").map((x) => parseInt(x + x, 16)).concat(1);
  m = c.match(/^#([0-9a-f]{6})$/i);
  if (m)
    return [
      parseInt(m[1].slice(0, 2), 16),
      parseInt(m[1].slice(2, 4), 16),
      parseInt(m[1].slice(4, 6), 16),
      1,
    ];
  m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  if (c === "#fff" || c === "white") return [255, 255, 255, 1];
  return null;
}
const over = (fg, bg) =>
  fg[3] >= 1 ? fg : [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ── Walk the components ──────────────────────────────────────────────────
const files = [];
for (const root of [
  "src/components/admin",
  "src/components/venue",
  "src/app/admin",
  "src/app/venue",
]) {
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".tsx")) files.push(p);
    }
  };
  walk(path.join(ROOT, root));
}

const CLASSY = /["'`]([^"'`\n]*\b(?:bg|text)-[a-z][a-z0-9/-]*[^"'`\n]*)["'`]/g;
const PAGE = parse(resolve(vars["--a-bg"]));
const CARD = parse(resolve(vars["--a-surface"]));
const NAV = parse(resolve(vars["--a-nav"]));

const bad = [];
const seen = new Set();

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  src.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(CLASSY)) {
      const attr = m[1].trim();
      if (!/\btext-/.test(attr)) continue;
      if (seen.has(attr)) continue;
      seen.add(attr);

      const fgWin = winner(attr, "fg");
      const bgWin = winner(attr, "bg");
      const fg = parse(resolve(fgWin?.value));
      if (!fg) continue;

      /*
       * What this text actually sits on. Its own background where it sets
       * one, otherwise whatever encloses it -- and the sidebar encloses its
       * text in --a-nav, not a white card. Scoring AdminNav against the card
       * reported five false failures for text that is light grey on near
       * black and perfectly legible.
       */
      const enclosing = /AdminNav|admin[\\/]layout/.test(f) ? NAV : CARD;
      const ownBg = parse(resolve(bgWin?.value));
      const ground = ownBg ? over(ownBg, enclosing) : enclosing;
      const text = over(fg, ground);
      const r = ratio(text, ground);

      if (r < 4.5) {
        bad.push({
          file: path.relative(ROOT, f).replace(/\\/g, "/"),
          line: i + 1,
          attr: attr.length > 64 ? attr.slice(0, 64) + "…" : attr,
          fg: resolve(fgWin?.value),
          bg: ownBg
            ? resolve(bgWin?.value)
            : `(enclosing ${enclosing === NAV ? "nav" : "card"})`,
          ratio: r.toFixed(2),
        });
      }
    }
  });
}

console.log(`admin theme vars resolved: page ${resolve(vars["--a-bg"])}, card ${resolve(vars["--a-surface"])}`);
console.log(`class strings checked: ${seen.size}`);
console.log(`below WCAG AA (4.5:1): ${bad.length}\n`);

bad.sort((a, b) => +a.ratio - +b.ratio);
for (const b of bad.slice(0, 40)) {
  console.log(`${b.ratio.padStart(5)}:1  ${b.file}:${b.line}`);
  console.log(`         text ${b.fg}  on  ${b.bg}`);
  console.log(`         ${b.attr}`);
}
