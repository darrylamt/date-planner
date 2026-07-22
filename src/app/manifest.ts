import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest — makes aduro installable to the iOS/Android home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "aduro — a date planned with intention",
    short_name: "aduro",
    description:
      "Tell us your budget, the vibe, and a little about them — we'll build a back-to-back evening in Accra with real menus and real prices.",
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#160A11",
    theme_color: "#1A0D14",
    categories: ["lifestyle", "food", "travel"],
    lang: "en",
    dir: "ltr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Plan an evening",
        short_name: "New plan",
        description: "Start a fresh back-to-back evening in Accra",
        url: "/plan/new?source=pwa-shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Saved plans",
        short_name: "Saved",
        description: "Your saved evenings",
        url: "/plans?source=pwa-shortcut",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
