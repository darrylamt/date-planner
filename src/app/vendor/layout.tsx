import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Duro! for cake and flower vendors",
  description: "Put your cakes and flowers into the plans people make on Duro.",
};

export const viewport: Viewport = { themeColor: "#fbf7f4", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** The vendor's space wears the planner's light theme (.planner in globals.css). */
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <div className="planner min-h-screen">{children}</div>;
}
