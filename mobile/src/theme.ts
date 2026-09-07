/**
 * aduro design tokens — monochrome.
 *
 * Ported from the Gavel system. The visual language is a printed itinerary:
 * white paper, black type, hierarchy built from size and space rather than
 * boxes and colour. Venue photography is the only thing that brings colour,
 * which is the point — the plan should look like the places, not like the app.
 *
 * One brand colour sits on top of that, and `ACCENT` below is the only place
 * it is written down; every tint, border and dark-mode variant is derived from
 * it, so trying a different hue is a one-line change.
 *
 * Rules of the system:
 *  - Surfaces are white on white. Separation comes from space, then hairlines.
 *  - Never fill a container just to group things; increase the gap instead.
 *  - Status keeps its own palette. Red means over budget, green means money
 *    left. The brand colour must never be used for either, or the one thing
 *    colour reliably told you stops being reliable.
 */

import { Platform } from "react-native";

/**
 * The one colour to change.
 *
 * A deep rose rather than the brighter #E23D6D: white text on this clears
 * 4.5:1, which the brighter tone does not, and it is used behind white type on
 * every primary button.
 */
export const ACCENT = "#C9184A";

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Blends `hex` toward `target` by `amount` (0–1).
 *
 * Tints are derived rather than hand-picked so a new accent cannot leave a
 * stale soft-fill or border behind — the failure mode of a palette written out
 * by hand, where one swatch gets missed and only shows up on one screen.
 */
function mix(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = channels(hex);
  const [r2, g2, b2] = channels(target);
  const blend = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `#${[blend(r1, r2), blend(g1, g2), blend(b1, b2)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

const WHITE = "#FFFFFF";
const BLACK = "#000000";

/** Lifted for dark surfaces, where the deep rose is too low-contrast for text. */
const ACCENT_DARK = mix(ACCENT, WHITE, 0.38);

export const Colors = {
  light: {
    background: "#FFFFFF",
    /** Cards sit on the same white; space separates them, not fill. */
    backgroundElement: "#FFFFFF",
    /** Pressed / selected chip and row states. */
    backgroundSelected: "#F0F0F0",
    /** The one tinted surface, for genuinely inset wells. */
    backgroundSunken: "#F7F7F7",

    text: "#0A0A0A",
    textSecondary: "#717171",
    textTertiary: "#949494",
    textOnBrand: "#FFFFFF",

    border: "#DDDDDD",
    borderStrong: "#B0B0B0",

    brand: ACCENT,
    accent: ACCENT,
    accentSoft: mix(ACCENT, WHITE, 0.93),
    accentBorder: mix(ACCENT, WHITE, 0.76),

    /** Over budget. */
    danger: "#DC2626",
    dangerSoft: "#FEF2F2",
    /** Comfortably inside the budget. */
    success: "#15803D",
    successSoft: "#F1FBF4",
    /** Deliberately grey: an estimate is information, not an alarm. */
    warning: "#52525B",
    warningSoft: "#FAFAFA",

    overlay: "rgba(0, 0, 0, 0.38)",
    skeleton: "#F4F4F5",
  },
  dark: {
    background: "#000000",
    backgroundElement: "#000000",
    backgroundSelected: "#1C1C1E",
    backgroundSunken: "#0C0C0D",

    text: "#FAFAFA",
    textSecondary: "#A1A1AA",
    textTertiary: "#71717A",
    textOnBrand: "#0A0A0A",

    border: "#1F1F22",
    borderStrong: "#2E2E32",

    brand: ACCENT_DARK,
    accent: ACCENT_DARK,
    accentSoft: mix(ACCENT, BLACK, 0.82),
    accentBorder: mix(ACCENT, BLACK, 0.66),

    danger: "#FF453A",
    dangerSoft: "#231110",
    success: "#30D158",
    successSoft: "#0C1F13",
    warning: "#A1A1AA",
    warningSoft: "#141416",

    overlay: "rgba(0, 0, 0, 0.62)",
    skeleton: "#18181B",
  },
} as const;

/** Widened so both schemes satisfy the same shape. */
export type ThemeColors = { [K in keyof (typeof Colors)["light"]]: string };
export type ThemeColor = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: { sans: "normal", serif: "serif", rounded: "normal", mono: "monospace" },
});

/**
 * Generous by default. In a layout with no borders or fills, spacing is the
 * only thing doing the grouping, so these run larger than a boxed design needs.
 */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  /** Padding inside a card. */
  card: 20,
  /** Screen side margins. */
  gutter: 24,
  /** Air between major sections — the workhorse of the layout. */
  section: 40,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/**
 * Soft, wide, low-opacity shadows — a surface should look lifted, never
 * outlined in grey. Paired with a hairline border so cards still hold their
 * edge on a white page where a shadow alone would disappear.
 */
export const Elevation = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

/** Shared timing so every micro-interaction feels like one system. */
export const Motion = {
  fast: 140,
  base: 240,
  slow: 420,
} as const;

/**
 * Type scale. Sizes carry the hierarchy, because nothing else does — there are
 * no boxes or rules to lean on.
 */
export const type = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: "700", letterSpacing: -1.1 },
  title1: { fontSize: 30, lineHeight: 35, fontWeight: "700", letterSpacing: -0.6 },
  title2: { fontSize: 24, lineHeight: 29, fontWeight: "700", letterSpacing: -0.4 },
  title3: { fontSize: 19, lineHeight: 24, fontWeight: "600", letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400", letterSpacing: -0.2 },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: "400", letterSpacing: -0.2 },
  subheadline: { fontSize: 14, lineHeight: 20, fontWeight: "400", letterSpacing: -0.1 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.2 },
  /** Section eyebrows: small, spaced, uppercase at the call site. */
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 0.8 },

  // Aliases kept so the port did not have to touch every call site at once.
  largeTitle: { fontSize: 34, lineHeight: 39, fontWeight: "700", letterSpacing: -0.8 },
  displaySmall: { fontSize: 30, lineHeight: 35, fontWeight: "700", letterSpacing: -0.6 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.2 },
  caption2: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0.3 },
} as const;

/** Screen side margin. */
export const GUTTER = Spacing.gutter;

/** Hairlines stay crisp at any density. */
export const HAIRLINE = 0.5;

/**
 * Named spacing kept from the previous scale, remapped onto the new rhythm —
 * the large steps are deliberately bigger, because space is what groups things
 * now that fills do not.
 */
export const space = {
  xs: Spacing.one,
  sm: Spacing.two,
  md: 12,
  lg: Spacing.three,
  xl: Spacing.card,
  xxl: Spacing.four,
  xxxl: Spacing.section,
} as const;

export const radius = {
  row: Radius.md,
  card: Radius.xl,
  control: Radius.md,
  sheet: Radius.lg,
  pill: Radius.pill,
} as const;

export const shadow = Elevation;
