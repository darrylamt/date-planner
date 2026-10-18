import type { Viewport } from "next";

export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#fbf7f4", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** A group invite wears the planner's light theme (.planner in globals.css), like the vendor pages. */
export default function GroupLayout({ children }: { children: React.ReactNode }) {
  return <div className="planner min-h-screen">{children}</div>;
}
