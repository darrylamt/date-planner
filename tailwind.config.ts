import type { Config } from "tailwindcss";

/**
 * Design tokens, single source of truth.
 *
 * Extracted from the Claude Design source ("Accra Date Planner.dc.html").
 * Per the client's follow-up notes the original earth-tone palette
 * (cream #FAF3E3 / rust #B04A17 / espresso #2E2013) was swapped for a
 * livelier sunset-coral + lagoon-teal palette, and the Newsreader/Familjen
 * Grotesk pairing was swapped for Poppins (+ Roboto Mono for prices).
 * Every structural token (radii, shadows, spacing, component shapes)
 * still follows the design source one-to-one.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces, dark romantic: deep plum-black velvet
        cream: "#1A0D14", // app background
        sand: "#331A26", // secondary surface
        shell: "#26131D", // card background
        parchment: "#200F18", // itinerary page bg
        blush: "#FFF1F6", // light text on accents / photos
        // Brand
        flame: {
          DEFAULT: "#E23D6D", // primary accent, deep rose
          deep: "#C92C58", // hover
          dark: "#AF2148", // pressed / link hover
        },
        amber: {
          DEFAULT: "#E5B04E", // candlelight gold accent
          deep: "#D19A32",
        },
        lagoon: {
          DEFAULT: "#3A1526", // raised dark surface, velvet wine
          mid: "#55203A", // budget bar track
          soft: "#BC8CA3", // muted text on dark
          faint: "#F8E0EA", // light text on dark
        },
        // Ink & muted text
        ink: "#F7E9F0", // main text
        cocoa: "#D6AFC1", // secondary text
        mutedbrown: "#A87E92", // captions
        // Lines & chips
        line: "#4A2336", // borders
        linesoft: "#3D1C2C", // dashed dividers
        chipborder: "#5A2A40", // chip outline
        track: "#40202F", // progress rail / slider rail
        whybg: "#2E1522", // "why this fits" note bg
        avoidbg: "#351726", // avoid-note bg
        stale: "#4A2336", // stale badge bg
        staletext: "#F2A2C0", // stale badge text
      },
      fontFamily: {
        // One sans face throughout, matches the iOS app, which uses the
        // system sans. Weight and size carry hierarchy, not a change of face.
        display: ["var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // Roboto Mono for prices, times and labels (design used ui-monospace)
        mono: ["var(--font-roboto-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Type scale from the design source
        hero: ["40px", { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        stepq: ["30px", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        section: ["22px", { lineHeight: "1.3" }],
        vname: ["21px", { lineHeight: "1.3" }],
        body: ["16px", { lineHeight: "1.6" }],
        sub: ["17px", { lineHeight: "1.6" }],
        caption: ["13px", { lineHeight: "1.5" }],
      },
      borderRadius: {
        btn: "16px", // buttons
        card: "20px", // cards / stops
        input: "14px", // inputs & textareas
        chip: "999px", // chips
        bar: "18px", // budget bar
        icon: "12px", // icon tiles / back button
        swap: "11px", // swap button
      },
      boxShadow: {
        card: "0 6px 22px rgba(0, 0, 0, 0.45)",
        phone: "0 16px 48px rgba(0, 0, 0, 0.6)",
        chip: "0 4px 14px rgba(226, 61, 109, 0.45)",
        knob: "0 3px 10px rgba(226, 61, 109, 0.5)",
        toast: "0 8px 24px rgba(0, 0, 0, 0.55)",
      },
      keyframes: {
        shimmer: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" },
        },
        pulsedot: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        fadeup: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        pulsedot: "pulsedot 1.6s infinite",
        fadeup: "fadeup 0.35s ease both",
      },
    },
  },
  plugins: [],
};
export default config;
