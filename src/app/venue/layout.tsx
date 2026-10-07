import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Duro! for venues",
  description: "Keep your menu, hours and nights current, and see the bookings Duro sends you.",
};

export const viewport: Viewport = { themeColor: "#fbf7f4", width: "device-width", initialScale: 1, viewportFit: "cover" };

/**
 * The venue portal wears the planner's light theme (.planner in globals.css).
 * Thin on purpose: the login page lives under this route and must render
 * without a session, so each page applies the gate itself.
 */
export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return <div className="planner min-h-screen">{children}</div>;
}
