/*
 * A venue's menu page look (0111): fonts, colours, light or dark, and the
 * silhouettes shown for a dish with no photo. Shared by the public page, the
 * venue portal and the admin.
 */

export type MenuStyle = {
  logo_url: string | null;
  cover_url: string | null;
  theme: "light" | "dark";
  accent: string;
  heading_font: string;
  body_font: string;
};

export const DEFAULT_STYLE: MenuStyle = {
  logo_url: null,
  cover_url: null,
  theme: "light",
  accent: "#C2410C",
  heading_font: "Fraunces",
  body_font: "DM Sans",
};

/** Google Fonts a venue may choose, each with its weights. Kept short so every one looks good. */
export const FONTS: { name: string; kind: "serif" | "sans" | "display" | "script"; weights: string }[] = [
  { name: "Fraunces", kind: "serif", weights: "400;600;800" },
  { name: "Playfair Display", kind: "serif", weights: "400;700;900" },
  { name: "DM Serif Display", kind: "serif", weights: "400" },
  { name: "Lora", kind: "serif", weights: "400;600;700" },
  { name: "Archivo Black", kind: "display", weights: "400" },
  { name: "Bebas Neue", kind: "display", weights: "400" },
  { name: "Anton", kind: "display", weights: "400" },
  { name: "Poppins", kind: "sans", weights: "400;600;800" },
  { name: "Montserrat", kind: "sans", weights: "400;600;800" },
  { name: "DM Sans", kind: "sans", weights: "400;500;700" },
  { name: "Inter", kind: "sans", weights: "400;500;700" },
  { name: "Nunito", kind: "sans", weights: "400;600;800" },
  { name: "Work Sans", kind: "sans", weights: "400;500;700" },
  { name: "Caveat", kind: "script", weights: "500;700" },
  { name: "Pacifico", kind: "script", weights: "400" },
];

const known = new Set(FONTS.map((f) => f.name));
export const safeFont = (name: string | null | undefined, fallback: string) => (name && known.has(name) ? name : fallback);

/** One stylesheet link for the fonts a page uses. */
export function fontsHref(names: string[]): string {
  const fams = [...new Set(names)]
    .map((n) => FONTS.find((f) => f.name === n))
    .filter(Boolean)
    .map((f) => `family=${encodeURIComponent(f!.name).replace(/%20/g, "+")}:wght@${f!.weights}`);
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}

export const fontStack = (name: string) => {
  const f = FONTS.find((x) => x.name === name);
  const tail = f?.kind === "serif" ? "Georgia, serif" : f?.kind === "script" ? "cursive" : "system-ui, sans-serif";
  return `'${name}', ${tail}`;
};

/** Accent colours offered first; any other is a colour picker away. */
export const ACCENTS = ["#C2410C", "#B45309", "#9F1239", "#BE185D", "#7C3AED", "#1D4ED8", "#0F766E", "#15803D", "#0B5A3E", "#1F2937"];

export const validHex = (s: string | null | undefined) => (s && /^#[0-9A-Fa-f]{6}$/.test(s) ? s : null);

/** The page's colours for a theme and an accent. */
export function palette(style: MenuStyle) {
  const light = style.theme === "light";
  return {
    bg: light ? "#FAF6F1" : "#140D10",
    surface: light ? "#FFFFFF" : "#21161B",
    tint: light ? `${style.accent}14` : `${style.accent}26`,
    ink: light ? "#24170F" : "#F6ECEF",
    muted: light ? "#7A6A5E" : "#B8A3AC",
    line: light ? "#EADFD3" : "#3A2A31",
    accent: style.accent,
    onAccent: "#FFFFFF",
  };
}

/**
 * A drawn silhouette for a dish with no photo: a plated main, a drink with a
 * straw, a dessert, a starter bowl. Single-colour SVG paths in a 64 x 64 box.
 */
export const SILHOUETTE: Record<string, string> = {
  main: "M8 40h48a2 2 0 0 1 0 4H8a2 2 0 0 1 0-4zm24-22c11 0 20 8 21 19H11c1-11 10-19 21-19zm-2-5h4a2 2 0 0 1 0 4h-4a2 2 0 0 1 0-4zM14 48h36l-3 4H17z",
  drink: "M20 18h24l-3 36a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3zm2 6 .6 6h18.8l.6-6zM37 6l2 1-4 12h-2z",
  dessert: "M16 30c0-8 7-13 16-13s16 5 16 13zm-2 4h36l-4 18a3 3 0 0 1-3 2H21a3 3 0 0 1-3-2zm18-21a4 4 0 1 1 0-8 4 4 0 0 1 0 8z",
  starter: "M10 30h44c0 12-10 20-22 20S10 42 10 30zm10-6c2-4 6-6 12-6s10 2 12 6zM24 52h16v3H24z",
  activity: "M10 20h44v8a4 4 0 0 0 0 8v8H10v-8a4 4 0 0 0 0-8zm22 4v16",
  other: "M8 40h48a2 2 0 0 1 0 4H8a2 2 0 0 1 0-4zm24-22c11 0 20 8 21 19H11c1-11 10-19 21-19z",
};
