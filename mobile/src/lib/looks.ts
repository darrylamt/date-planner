import type { ThemeColors } from "../theme";

/**
 * The looks a person can choose (owner, 2 Nov 2026: "can we have themes so
 * people can select? and maybe use the kente as default for the new in
 * ghana/accra mode").
 *
 * One layout for every screen; a look changes only colour, type and surface.
 * Every older screen reads `colors` through useTheme, so it takes the look on
 * as well, before it is rebuilt.
 */
export type LookId = "kente" | "night" | "daylight";

/** What is stored: a look, or the sky, which is Daylight by day and Night after dark. */
export type LookChoice = LookId | "sky";

export interface Look {
  id: LookId;
  scheme: "light" | "dark";
  colors: ThemeColors;
  /** The main button, and what is written on it. */
  primary: string;
  onPrimary: string;
  /** Two more colours for blocks, tokens and stops, each with its text. */
  second: string;
  onSecond: string;
  third: string;
  onThird: string;
  /** A tile's faint fill and edge. */
  tile: string;
  tileEdge: string;
  /** Display type, by weight. Body text stays Figtree in every look. */
  display: { "600": string; "700": string; "800": string };
  /** The woven band along the top of a screen. */
  band: boolean;
  /** The dusk sky behind a screen. */
  sky: boolean;
}

/** Ghana, until a person picks another (the markets plan sets this per country). */
export const DEFAULT_LOOK: LookChoice = "kente";

export const LOOK_CHOICES: { id: LookChoice; title: string; sub: string }[] = [
  { id: "kente", title: "Kente", sub: "Black, gold and woven colour. Default in Ghana." },
  { id: "night", title: "Night", sub: "A dusk sky and glass. Easy on the eyes." },
  { id: "daylight", title: "Daylight", sub: "Clean white. Best outdoors in the sun." },
  { id: "sky", title: "Follow the sky", sub: "Daylight by day, Night after sunset." },
];

export const KENTE = {
  black: "#12100C",
  gold: "#F2C14E",
  green: "#1F7A4D",
  red: "#C8372D",
  cream: "#F7F1E3",
} as const;

const kente: Look = {
  id: "kente",
  scheme: "dark",
  colors: {
    background: KENTE.black,
    backgroundElement: "#1C1914",
    backgroundSelected: "#2A251D",
    backgroundSunken: "#0D0B08",
    text: KENTE.cream,
    textSecondary: "#BDB4A3",
    textTertiary: "#9A9181",
    textOnBrand: KENTE.black,
    border: "#2C271F",
    borderStrong: "#4A4234",
    brand: KENTE.gold,
    accent: KENTE.gold,
    accentSoft: "#2E2615",
    accentBorder: "#5C4A1E",
    danger: "#FF6B5B",
    dangerSoft: "#2A1311",
    success: "#4CC38A",
    successSoft: "#0F2419",
    warning: "#A8A29E",
    warningSoft: "#1A1814",
    overlay: "rgba(0, 0, 0, 0.62)",
    skeleton: "#1F1B15",
    glass: "rgba(28, 25, 20, 0.6)",
    glassBorder: "rgba(247, 241, 227, 0.12)",
  },
  primary: KENTE.gold,
  onPrimary: KENTE.black,
  second: KENTE.green,
  onSecond: KENTE.cream,
  third: KENTE.cream,
  onThird: KENTE.black,
  tile: "rgba(247, 241, 227, 0.05)",
  tileEdge: "rgba(247, 241, 227, 0.14)",
  display: { "600": "BricolageGrotesque_600SemiBold", "700": "BricolageGrotesque_700Bold", "800": "BricolageGrotesque_800ExtraBold" },
  band: true,
  sky: false,
};

const night: Look = {
  id: "night",
  scheme: "dark",
  colors: {
    background: "#0C0A16",
    backgroundElement: "#17132A",
    backgroundSelected: "#241D3F",
    backgroundSunken: "#08070E",
    text: "#F5F3FF",
    textSecondary: "#B4AEC8",
    textTertiary: "#948EAA",
    textOnBrand: "#170F2B",
    border: "#261F40",
    borderStrong: "#3D3460",
    brand: "#FFB547",
    accent: "#FFB547",
    accentSoft: "#2E2318",
    accentBorder: "#6B4B1E",
    danger: "#FF6B6B",
    dangerSoft: "#2A1216",
    success: "#4ADE80",
    successSoft: "#0E2218",
    warning: "#A1A1AA",
    warningSoft: "#141320",
    overlay: "rgba(0, 0, 0, 0.62)",
    skeleton: "#1B1730",
    glass: "rgba(28, 22, 48, 0.55)",
    glassBorder: "rgba(255, 255, 255, 0.12)",
  },
  primary: "#FFB547",
  onPrimary: "#170F2B",
  second: "#8B5CF6",
  onSecond: "#FFFFFF",
  third: "#F5F3FF",
  onThird: "#140F26",
  tile: "rgba(255, 255, 255, 0.07)",
  tileEdge: "rgba(255, 255, 255, 0.12)",
  display: { "600": "InterTight_600SemiBold", "700": "InterTight_700Bold", "800": "InterTight_700Bold" },
  band: false,
  sky: true,
};

const daylight: Look = {
  id: "daylight",
  scheme: "light",
  colors: {
    background: "#FFFFFF",
    backgroundElement: "#F5F5F7",
    backgroundSelected: "#ECECF0",
    backgroundSunken: "#F2F2F5",
    text: "#0B0B0F",
    textSecondary: "#5E6270",
    textTertiary: "#676B77",
    textOnBrand: "#FFFFFF",
    border: "#ECEDF1",
    borderStrong: "#C9CBD3",
    brand: "#E11D48",
    accent: "#E11D48",
    accentSoft: "#FDE8EC",
    accentBorder: "#F7B4C2",
    danger: "#DC2626",
    dangerSoft: "#FEF2F2",
    success: "#15803D",
    successSoft: "#F1FBF4",
    warning: "#52525B",
    warningSoft: "#FAFAFA",
    overlay: "rgba(0, 0, 0, 0.38)",
    skeleton: "#F4F4F5",
    glass: "rgba(255, 255, 255, 0.7)",
    glassBorder: "rgba(0, 0, 0, 0.08)",
  },
  primary: "#0B0B0F",
  onPrimary: "#FFFFFF",
  second: "#E11D48",
  onSecond: "#FFFFFF",
  third: "#F2F2F5",
  onThird: "#0B0B0F",
  tile: "#F5F5F7",
  tileEdge: "#ECEDF1",
  display: { "600": "Geist_600SemiBold", "700": "Geist_700Bold", "800": "Geist_800ExtraBold" },
  band: false,
  sky: false,
};

export const LOOKS: Record<LookId, Look> = { kente, night, daylight };

/** Daylight from six in the morning until six in the evening, Night otherwise. */
export function lookFor(choice: LookChoice, now: Date = new Date()): Look {
  if (choice !== "sky") return LOOKS[choice];
  const h = now.getHours();
  return h >= 6 && h < 18 ? daylight : night;
}

export function isLookChoice(v: unknown): v is LookChoice {
  return v === "kente" || v === "night" || v === "daylight" || v === "sky";
}
