import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";
import { occasionColors } from "@/lib/occasionCard";
import { OCCASION_THEME } from "@/lib/planConstants";
import { loadGroup, publicView } from "@/lib/groupServer";
import { OG_MARK, OG_WORDMARK } from "@/lib/brandImages";
import type { Occasion } from "@/lib/types";

export const alt = "A group outing on Duro!";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MOTIF: Record<string, string> = { friend_outing: "🤙", birthday: "🎂", celebration: "🥂", graduation: "🎓" };
const WHAT: Record<string, string> = {
  friend_outing: "a night out",
  birthday: "a birthday",
  celebration: "a celebration",
  graduation: "a graduation",
};

async function font(weight: 600 | 800): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/figtree@latest/latin-${weight}-normal.woff`);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function range(from: string, to: string): string {
  const f = new Date(`${from}T12:00:00Z`);
  const t = new Date(`${to}T12:00:00Z`);
  const opts = { day: "numeric", month: "short", timeZone: "UTC" } as const;
  return from === to ? f.toLocaleDateString("en-GB", { weekday: "short", ...opts }) : `${f.toLocaleDateString("en-GB", opts)} – ${t.toLocaleDateString("en-GB", opts)}`;
}

/**
 * The picture under a group invite in WhatsApp: who is planning what, and
 * when. Nothing about money and no other names: it shows before anyone taps.
 */
export default async function Image({ params }: { params: { code: string } }) {
  const db = createServiceClient();
  const [group, semi, bold] = await Promise.all([loadGroup(db, params.code), font(600), font(800)]);
  const fonts = [
    ...(semi ? [{ name: "Figtree", data: semi, weight: 600 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Figtree", data: bold, weight: 800 as const, style: "normal" as const }] : []),
  ];
  const family = fonts.length ? "Figtree" : "sans-serif";
  const view = group && group.status !== "cancelled" ? await publicView(db, group) : null;
  const occasion = (view?.occasion ?? "friend_outing") as Occasion;
  const theme = OCCASION_THEME[occasion] ?? OCCASION_THEME.date_night;
  const [c1, c2] = occasionColors(occasion);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: theme.pageDark,
          backgroundImage: `radial-gradient(circle at 12% 8%, ${c1}66, transparent 48%), radial-gradient(circle at 92% 95%, ${c2}55, transparent 52%)`,
          color: "#F7E9F0",
          padding: "60px 64px",
          fontFamily: family,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 26, fontWeight: 800, letterSpacing: 5, color: c1 }}>
            <span style={{ marginRight: 14, fontSize: 32 }}>{MOTIF[occasion] ?? "🤙"}</span>
            GROUP OUTING
          </div>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.04, marginTop: 24, maxWidth: 1000 }}>
            {view ? `${view.organiser} is planning ${view.title || WHAT[occasion] || "an outing"}` : "Plan it together on Duro!"}
          </div>
          {view ? (
            <div
              style={{
                display: "flex",
                fontSize: 44,
                fontWeight: 800,
                marginTop: 18,
                backgroundImage: `linear-gradient(90deg, ${c1}, ${c2})`,
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {range(view.dateFrom, view.dateTo)}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 16, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={OG_MARK} width={34} height={34} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={OG_WORDMARK} width={126} height={46} style={{ marginLeft: 14 }} />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, marginLeft: 28, color: "rgba(247,233,240,0.75)" }}>
            Tap to say when you&apos;re free. Your budget stays private.
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
