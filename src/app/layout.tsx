import type { Metadata, Viewport } from "next";
import { Playfair_Display, Poppins, Roboto_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-poppins",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "aduro — a date planned with intention · Accra",
  description:
    "Tell us your budget, the vibe, and a little about them — we'll build a back-to-back evening in Accra with real menus and real prices.",
};

export const viewport: Viewport = {
  themeColor: "#1A0D14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${poppins.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
