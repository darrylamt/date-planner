import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ThemeSync } from "@/components/ThemeSync";

/**
 * One sans face across the whole product, web and iOS.
 *
 * Figtree: a geometric sans with friendly terminals and a large x-height,
 * the closest freely licensed face to the warm geometric sans this kind of
 * travel/booking product is usually set in. The previous serif display font
 * read as a different brand from the app.
 */
const sans = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

/** Headings, as in the app's redesign (owner, 15 Nov 2026). */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Duro! · Plan outings in Ghana",
  description:
    "Dates, birthdays, a night out with friends or a day on your own, planned stop by stop from real menus and real prices in Accra and Kumasi.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0A16" },
  ],
};

/** ?theme=light or ?theme=dark pins a look for this visit (globals.css data-theme); otherwise the device decides. */
const THEME_SCRIPT = `try{var t=new URLSearchParams(location.search).get("theme");if(t==="light"||t==="dark"){sessionStorage.setItem("duro-theme",t)}t=t||sessionStorage.getItem("duro-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${robotoMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
