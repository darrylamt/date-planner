/**
 * aduro design system — Apple HIG aligned.
 *
 * Semantic colours mirror the iOS system palette so the app feels native and
 * follows the phone's appearance setting automatically. Nothing here is a
 * hard-coded literal at the call site: screens ask for `c.label`, `c.separator`
 * or `c.tint` and get the right value for the current scheme.
 *
 * Brand presence is deliberately narrow — a single rose tint. Colour otherwise
 * comes from venue photography, which is the point of the product.
 */

export interface Palette {
  /** Page background for plain (non-grouped) screens. */
  background: string;
  /** Background behind grouped/inset lists — iOS systemGroupedBackground. */
  groupedBackground: string;
  /** Card / row surface sitting on groupedBackground. */
  surface: string;
  /** A surface raised above `surface` (sheets, nested cards). */
  surfaceRaised: string;

  /** Primary text. */
  label: string;
  /** Supporting text. */
  secondaryLabel: string;
  /** De-emphasised text, placeholders. */
  tertiaryLabel: string;
  /** Disabled text. */
  quaternaryLabel: string;

  /** Hairline between rows — translucent, sits over content. */
  separator: string;
  /** Opaque divider for full-bleed edges. */
  opaqueSeparator: string;
  /** Neutral filled control background (unselected segment, track). */
  fill: string;
  /** A lighter neutral fill. */
  fillSecondary: string;

  /** Brand accent — buttons, selection, links. */
  tint: string;
  /** Accent at low opacity, for selected row backgrounds. */
  tintMuted: string;
  /** Text/icon colour on top of `tint`. */
  onTint: string;

  green: string;
  orange: string;
  red: string;

  /** Placeholder block behind loading imagery. */
  imagePlaceholder: string;
}

const light: Palette = {
  background: "#FFFFFF",
  groupedBackground: "#F2F2F7",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",

  label: "#000000",
  secondaryLabel: "rgba(60, 60, 67, 0.60)",
  tertiaryLabel: "rgba(60, 60, 67, 0.30)",
  quaternaryLabel: "rgba(60, 60, 67, 0.18)",

  separator: "rgba(60, 60, 67, 0.29)",
  opaqueSeparator: "#C6C6C8",
  fill: "rgba(120, 120, 128, 0.12)",
  fillSecondary: "rgba(120, 120, 128, 0.08)",

  // Deepened rose: 5.9:1 on white, so it is legible as text, not just as a fill.
  tint: "#C9184A",
  tintMuted: "rgba(201, 24, 74, 0.10)",
  onTint: "#FFFFFF",

  green: "#248A3D",
  orange: "#C93400",
  red: "#D70015",

  imagePlaceholder: "#E5E5EA",
};

const dark: Palette = {
  background: "#000000",
  groupedBackground: "#000000",
  surface: "#1C1C1E",
  surfaceRaised: "#2C2C2E",

  label: "#FFFFFF",
  secondaryLabel: "rgba(235, 235, 245, 0.60)",
  tertiaryLabel: "rgba(235, 235, 245, 0.30)",
  quaternaryLabel: "rgba(235, 235, 245, 0.18)",

  separator: "rgba(84, 84, 88, 0.65)",
  opaqueSeparator: "#38383A",
  fill: "rgba(120, 120, 128, 0.24)",
  fillSecondary: "rgba(120, 120, 128, 0.16)",

  tint: "#FF5C8A",
  tintMuted: "rgba(255, 92, 138, 0.16)",
  onTint: "#FFFFFF",

  green: "#30D158",
  orange: "#FF9F0A",
  red: "#FF453A",

  imagePlaceholder: "#2C2C2E",
};

export const palettes = { light, dark };

/**
 * Apple's text styles. Sizes match the default (Large) Dynamic Type setting;
 * `fontWeight` values are the ones SF uses for each style.
 */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600", letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400", letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400", letterSpacing: -0.32 },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400", letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400", letterSpacing: 0.07 },
} as const;

/** Corner radii — iOS uses continuous curvature; these are the visual matches. */
export const radius = {
  row: 10, // grouped list container
  card: 12, // standalone card
  control: 12, // buttons, inputs
  sheet: 16,
  pill: 999,
} as const;

/** 4pt spacing scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Standard iOS content inset. */
export const GUTTER = 16;

/** Hairline that stays 1px on every screen density. */
export const HAIRLINE = 0.5;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  raised: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;
