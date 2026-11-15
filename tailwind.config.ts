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
        // Daylight and Night, from CSS variables (globals.css; owner 15 Nov 2026).
        cream: "rgb(var(--c-cream) / <alpha-value>)", // page background
        sand: "rgb(var(--c-sand) / <alpha-value>)", // secondary surface
        shell: "rgb(var(--c-shell) / <alpha-value>)", // card background
        parchment: "rgb(var(--c-parchment) / <alpha-value>)",
        blush: "rgb(var(--c-blush) / <alpha-value>)", // text on the accent
        flame: { DEFAULT: "rgb(var(--c-flame) / <alpha-value>)", deep: "rgb(var(--c-flame-deep) / <alpha-value>)", dark: "rgb(var(--c-flame-dark) / <alpha-value>)" }, // the accent
        amber: { DEFAULT: "rgb(var(--c-amber) / <alpha-value>)", deep: "rgb(var(--c-amber-deep) / <alpha-value>)" },
        lagoon: { DEFAULT: "rgb(var(--c-lagoon) / <alpha-value>)", mid: "rgb(var(--c-lagoon-mid) / <alpha-value>)", soft: "rgb(var(--c-lagoon-soft) / <alpha-value>)", faint: "rgb(var(--c-lagoon-faint) / <alpha-value>)" },
        ink: "rgb(var(--c-ink) / <alpha-value>)", // main text
        cocoa: "rgb(var(--c-cocoa) / <alpha-value>)", // secondary text
        mutedbrown: "rgb(var(--c-mutedbrown) / <alpha-value>)", // captions
        line: "rgb(var(--c-line) / <alpha-value>)",
        linesoft: "rgb(var(--c-linesoft) / <alpha-value>)",
        chipborder: "rgb(var(--c-chipborder) / <alpha-value>)",
        track: "rgb(var(--c-track) / <alpha-value>)",
        whybg: "rgb(var(--c-whybg) / <alpha-value>)",
        avoidbg: "rgb(var(--c-avoidbg) / <alpha-value>)",
        stale: "rgb(var(--c-stale) / <alpha-value>)",
        staletext: "rgb(var(--c-staletext) / <alpha-value>)",
      },
      fontFamily: {
        // One sans face throughout, matches the iOS app, which uses the
        // system sans. Weight and size carry hierarchy, not a change of face.
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
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
        card: "var(--c-shadow)",
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
