import type { Metadata, Viewport } from "next";
import { Figtree, Roboto_Mono } from "next/font/google";
import "./globals.css";

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
  themeColor: "#1A0D14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
