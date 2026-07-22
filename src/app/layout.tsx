import type { Metadata, Viewport } from "next";
import { Playfair_Display, Poppins, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

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
  metadataBase: new URL("https://aduro.app"),
  title: "aduro — a date planned with intention · Accra",
  description:
    "Tell us your budget, the vibe, and a little about them — we'll build a back-to-back evening in Accra with real menus and real prices.",
  applicationName: "aduro",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "aduro",
    statusBarStyle: "black",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1A0D14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${poppins.variable} ${robotoMono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
