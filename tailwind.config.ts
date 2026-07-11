import type { Config } from "tailwindcss";

/**
 * Design tokens — single source of truth.
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
        // Surfaces
        cream: "#FFF7ED", // app background (was #FAF3E3)
        sand: "#FFE9D2", // secondary surface (was #F1E4CB)
        shell: "#FFFDF8", // card background (was #FFFBF0)
        parchment: "#FFF1DE", // itinerary page bg (was #F5EBD3)
        // Brand
        flame: {
          DEFAULT: "#F4501E", // primary accent (was sunset rust #B04A17)
          deep: "#D8430F", // hover (was #963D0F)
          dark: "#C13A0B", // pressed / link hover (was #8F3A0E)
        },
        amber: {
          DEFAULT: "#FFB627", // gold accent (was #DE9E36)
          deep: "#F5A300",
        },
        lagoon: {
          DEFAULT: "#123B41", // dark surface (was dusk espresso #2E2013)
          mid: "#1E5058", // budget bar track (was #4A3826)
          soft: "#8FB8BD", // muted text on dark (was #C4AC8B)
          faint: "#DCEBEC", // light text on dark (was #F6E9CF)
        },
        // Ink & muted text
        ink: "#211A14", // main text (was #382516)
        cocoa: "#6B5442", // secondary text (was #66503B)
        mutedbrown: "#94795F", // captions (was #7C6547)
        // Lines & chips
        line: "#F1D8B8", // borders (was #DBC49D / #D6BE97)
        linesoft: "#F7E6CC", // dashed dividers (was #E9D8B8)
        chipborder: "#F0D2A8", // chip outline (was #DBC49D)
        track: "#F3DDBE", // progress rail / slider rail (was #E5D3B3)
        whybg: "#FFEFD6", // "why this fits" note bg (was #F5E8CE)
        avoidbg: "#FFF0E3", // avoid-note bg
        stale: "#FFE0C7", // stale badge bg
        staletext: "#B33E0C", // stale badge text
      },
      fontFamily: {
        // Poppins for display + body (client request; replaces Newsreader / Familjen Grotesk)
        display: ["var(--font-poppins)", "system-ui", "sans-serif"],
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
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
        card: "0 4px 18px rgba(33, 26, 20, 0.07)",
        phone: "0 16px 48px rgba(33, 26, 20, 0.14)",
        chip: "0 4px 14px rgba(244, 80, 30, 0.30)",
        knob: "0 3px 10px rgba(244, 80, 30, 0.35)",
        toast: "0 8px 24px rgba(18, 59, 65, 0.35)",
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
