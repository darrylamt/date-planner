import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Duro! for event planners",
  description: "Put your nights into the evenings people plan on Duro.",
};

export const viewport: Viewport = {
  themeColor: "#fbf7f4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The event planner's space. Only the theme lives here: the login page is
 * under this route too and must render without a session, so each page
 * applies the gate itself.
 */
export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return <div className="planner min-h-screen">{children}</div>;
}
