/**
 * aduro design tokens, near-monochrome, one accent, eight occasion hues.
 *
 * Ported from the Gavel system. The visual language is a printed itinerary:
 * cool off-white paper, near-black type, hierarchy built from size and space
 * rather than boxes and colour. Venue photography still carries most of the
 * colour, which is the point, the plan should look like the places.
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
 *  - Occasion hues live at icon scale and nowhere else. The moment they grow
 *    past a 38px circle the page stops being calm.
 */

import { Platform } from "react-native";

/**
 * The one colour to change.
 *
 * A deep lagoon teal: calm and coastal rather than the warm rose it replaced,
 * which pulled hard against venue photography. White text on this clears
 * 4.6:1, and it sits behind white type on every primary button.
 */
export const ACCENT = "#0F766E";

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
 * stale soft-fill or border behind, the failure mode of a palette written out
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

/** Lifted for dark surfaces, where the deep teal is too low-contrast for text. */
const ACCENT_DARK = mix(ACCENT, WHITE, 0.38);

export const Colors = {
  light: {
    /** Faintly cool off-white, a page, not a lightbox. */
    background: "#F6F9F8",
    /** Cards are true white, so they lift off the page without a heavy border. */
    backgroundElement: "#FFFFFF",
    /** Pressed / selected chip and row states. */
    backgroundSelected: "#E8EFEE",
    /** The one deeper tint, for genuinely inset wells. */
    backgroundSunken: "#EDF3F2",

    /** Near-black carrying a trace of the accent's hue, so nothing reads grey. */
    text: "#0C1413",
    textSecondary: "#5F6E6C",
    textTertiary: "#627170",
    textOnBrand: "#FFFFFF",

    border: "#DCE6E4",
    borderStrong: "#A9BAB7",

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
    /** Tint laid over a blur. Translucent by definition, never opaque. */
    glass: "rgba(255, 255, 255, 0.55)",
    glassBorder: "rgba(0, 0, 0, 0.08)",
  },
  dark: {
    background: "#07100F",
    backgroundElement: "#0E1817",
    backgroundSelected: "#182523",
    backgroundSunken: "#0A1413",

    text: "#F2F7F6",
    textSecondary: "#9BABA8",
    textTertiary: "#7B8B89",
    textOnBrand: "#04100E",

    border: "#1E2C2A",
    borderStrong: "#2E403D",

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
    glass: "rgba(28, 28, 30, 0.45)",
    glassBorder: "rgba(255, 255, 255, 0.12)",
  },
} as const;

/**
 * One muted hue per occasion, used only inside the 38px icon circle on the
 * home grid. Eight identical accent icons carried no information; eight
 * distinct ones let a card be recognised before it is read.
 *
 * Deliberately desaturated and confined to icon scale, this is the whole of
 * the app's colour beyond the accent, and it stays calm because it never
 * grows past a circle. Each hue ships with the wash it sits on.
 */
export const OCCASION_HUES: Record<string, { fg: string; bg: string }> = {
  first_date: { fg: "#B4536B", bg: "#F7EAEE" },
  anniversary: { fg: "#B4694A", bg: "#F8EDE7" },
  date_night: { fg: "#4A5B9E", bg: "#EAEDF7" },
  birthday: { fg: "#B07C24", bg: "#F8F0DF" },
  graduation: { fg: "#0F766E", bg: "#E4F0EE" },
  celebration: { fg: "#7E4E92", bg: "#F1E9F5" },
  friend_outing: { fg: "#4C7A56", bg: "#E9F1EA" },
  solo_day: { fg: "#556570", bg: "#EBEEF0" },
};

/** Dark-mode washes: the same hues, dropped onto the dark page. */
export const OCCASION_HUES_DARK: Record<string, { fg: string; bg: string }> = {
  first_date: { fg: "#E8899F", bg: "#25161A" },
  anniversary: { fg: "#E39B78", bg: "#251A14" },
  date_night: { fg: "#8D9BE0", bg: "#171A2A" },
  birthday: { fg: "#E0B45C", bg: "#241D10" },
  graduation: { fg: "#4FBFB2", bg: "#0E2321" },
  celebration: { fg: "#BE93D0", bg: "#201726" },
  friend_outing: { fg: "#8DBE97", bg: "#141F17" },
  solo_day: { fg: "#9AAAB5", bg: "#161B1F" },
};

/** Widened so both schemes satisfy the same shape. */
export type ThemeColors = { [K in keyof (typeof Colors)["light"]]: string };
export type ThemeColor = keyof ThemeColors;

/**
 * One sans face, web and iOS. Figtree is the closest freely licensed match to
 * the warm geometric sans this kind of booking product is usually set in.
 *
 * A custom family cannot synthesise weights reliably, so each weight is its
 * own family name and `fontFamilyFor` maps a numeric weight onto it. Falling
 * back to the system face keeps text readable if the asset has not loaded.
 */
export const FONT_FAMILIES = {
  "400": "Figtree_400Regular",
  "500": "Figtree_500Medium",
  "600": "Figtree_600SemiBold",
  "700": "Figtree_700Bold",
  "800": "Figtree_800ExtraBold",
} as const;

export function fontFamilyFor(weight: string | number | undefined): string {
  const key = String(weight ?? "400") as keyof typeof FONT_FAMILIES;
  return FONT_FAMILIES[key] ?? FONT_FAMILIES["400"];
}

export const Fonts = Platform.select({
  ios: { sans: "Figtree_400Regular", mono: "ui-monospace" },
  default: { sans: "Figtree_400Regular", mono: "monospace" },
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
  /** Air between major sections, the workhorse of the layout. */
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
 * Soft, wide, low-opacity shadows, a surface should look lifted, never
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
 * Type scale. Sizes carry the hierarchy, because nothing else does, there are
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
 * The floating nav sits over content rather than reserving space, so every
 * scroll view has to pad past it by `clearance`.
 */
export const TAB_BAR = { height: 66, clearance: 128 } as const;

/**
 * Named spacing kept from the previous scale, remapped onto the new rhythm,
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
