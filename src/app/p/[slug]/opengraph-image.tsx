import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";
import { longDate } from "@/lib/format";
import { OCCASION_THEME } from "@/lib/planConstants";
import { occasionCard } from "@/lib/occasionCard";
import type { SavedPlan } from "@/lib/types";

export const alt = "A plan made with aduro";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The picture that shows when a plan is pasted into WhatsApp.
 *
 * A shared plan is sent to one person, usually in a chat, and until now it
 * arrived as a bare link under the site's generic title. The whole point of
 * the card is that it looks like it was made for the person opening it, and
 * the first thing they see is the preview, not the page.
 *
 * Drawn rather than photographed. A venue photo would be the obvious choice
 * and is the wrong one: it would show one stop out of three, and the stop it
 * showed would depend on which venue happened to have an image on file.
 *
 * Every figure comes from the saved plan. Nothing here is generated.
 */
export default async function Image({ params }: { params: { slug: string } }) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("plans")
    .select("inputs, itinerary")
    .eq("share_slug", params.slug)
    .maybeSingle();

  const plan = data as Pick<SavedPlan, "inputs" | "itinerary"> | null;

  // A dead link still needs a picture; an empty one renders as a broken card.
  if (!plan) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#140B0D",
            color: "#F3E4E8",
            fontSize: 52,
            fontWeight: 700,
          }}
        >
          aduro
        </div>
      ),
      size
    );
  }

  const { inputs, itinerary } = plan;
  const theme = OCCASION_THEME[inputs.occasion] ?? OCCASION_THEME.date_night;
  const card = occasionCard(inputs);
  const stops = itinerary.stops ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: theme.pageDark,
          color: "#F4ECEE",
          padding: "68px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 6,
              fontWeight: 700,
              color: theme.accentDark,
            }}
          >
            {card.eyebrow.toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 700, marginTop: 14 }}>
            {longDate(inputs.date)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              marginTop: 16,
              color: "rgba(244,236,238,0.72)",
            }}
          >
            {itinerary.summary_route}
          </div>
        </div>

        {/* The stops, named. A plan is the places, so they are the picture. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stops.slice(0, 3).map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", fontSize: 30 }}>
              <div
                style={{
                  display: "flex",
                  width: 92,
                  color: theme.accentDark,
                  fontWeight: 700,
                }}
              >
                {s.arrival_time}
              </div>
              <div style={{ display: "flex" }}>{s.name}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(244,236,238,0.18)",
            paddingTop: 26,
          }}
        >
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>aduro</div>
          <div style={{ display: "flex", fontSize: 30, color: "rgba(244,236,238,0.72)" }}>
            {stops.length} stops · GHS {Math.round(Number(itinerary.est_total_ghs))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
