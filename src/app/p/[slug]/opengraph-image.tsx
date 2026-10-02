import { ImageResponse } from "next/og";
import { createServiceClient } from "@/lib/supabase/server";
import { longDate, time12 } from "@/lib/format";
import { OCCASION_THEME } from "@/lib/planConstants";
import { occasionCard, occasionColors } from "@/lib/occasionCard";
import type { Occasion, SavedPlan } from "@/lib/types";
import { OG_MARK, OG_WORDMARK } from "@/lib/brandImages";

export const alt = "A plan made with Duro!";

/*
 * The card's ornaments are typographic (✦, ❦, ◈), which the page draws from
 * the phone's own fonts and this renderer cannot: it has Figtree and emoji,
 * and a ✦ came out as an empty box. So the picture wears an emoji instead.
 */
const MOTIF: Record<Occasion, string> = {
  first_date: "✨",
  date_night: "❤️",
  anniversary: "💞",
  birthday: "🎂",
  graduation: "🎓",
  celebration: "🥂",
  friend_outing: "🤙",
  solo_day: "🌙",
  business_meeting: "🤝",
  family_day: "☀️",
};
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Figtree, the site's own face, fetched as the picture is drawn. A preview is
 * cached by every chat app that fetches it, so this runs about once a link;
 * if the fetch fails the picture still draws, in the default face.
 */
async function font(weight: 600 | 800): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/figtree@latest/latin-${weight}-normal.woff`);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * The picture that shows when a plan is pasted into WhatsApp.
 *
 * A shared plan is sent to one person, usually in a chat, and the preview is
 * the first thing they see and, if they do not tap, the only thing. So it is
 * dressed the way the page is: the occasion's two colours glowing out of the
 * dark, the date large with its second line in the gradient, and the stops
 * down the right as the cards they will find on the page.
 *
 * Drawn rather than photographed: a venue photo would show one stop out of
 * three, chosen by whichever venue happened to have an image on file. Every
 * word comes from the saved plan, and there is no price, because the preview
 * shows in the chat before anyone taps.
 */
export default async function Image({ params }: { params: { slug: string } }) {
  const supabase = createServiceClient();
  const [{ data }, semi, bold] = await Promise.all([
    supabase.from("plans").select("inputs, itinerary").eq("share_slug", params.slug).maybeSingle(),
    font(600),
    font(800),
  ]);
  const fonts = [
    ...(semi ? [{ name: "Figtree", data: semi, weight: 600 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Figtree", data: bold, weight: 800 as const, style: "normal" as const }] : []),
  ];
  const family = fonts.length ? "Figtree" : "sans-serif";

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
            backgroundColor: "#140B0D",
            backgroundImage: "radial-gradient(circle at 25% 20%, #E23D6D55, transparent 55%), radial-gradient(circle at 80% 85%, #E5B04E44, transparent 55%)",
            color: "#F3E4E8",
            fontSize: 64,
            fontWeight: 800,
            fontFamily: family,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={OG_WORDMARK} width={360} height={131} />
        </div>
      ),
      { ...size, fonts }
    );
  }

  const { inputs, itinerary } = plan;
  const theme = OCCASION_THEME[inputs.occasion] ?? OCCASION_THEME.date_night;
  const [c1, c2] = occasionColors(inputs.occasion);
  const card = occasionCard(inputs);
  const stops = itinerary.stops ?? [];
  const date = longDate(inputs.date);
  const gap = date.indexOf(" ");
  const weekday = gap > 0 ? date.slice(0, gap) : date;
  const dayMonth = gap > 0 ? date.slice(gap + 1) : "";
  const route = (itinerary.summary_route ?? "").split(/\s*→\s*/).filter(Boolean).slice(0, 4);
  const shown = stops.slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: theme.pageDark,
          // Colour apart from the gradients: the renderer refuses the two in one shorthand.
          backgroundImage: `radial-gradient(circle at 12% 8%, ${c1}66, transparent 48%), radial-gradient(circle at 92% 95%, ${c2}55, transparent 52%), radial-gradient(circle at 60% 40%, ${c1}1f, transparent 60%)`,
          color: "#F7E9F0",
          padding: "56px 60px",
          fontFamily: family,
        }}
      >
        {/* ── left: the occasion ── */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, paddingRight: 30 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 24, fontWeight: 800, letterSpacing: 5, color: c1 }}>
              <span style={{ marginRight: 14, fontSize: 30 }}>{MOTIF[inputs.occasion] ?? "✨"}</span>
              {card.eyebrow}
            </div>
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -3, lineHeight: 1, marginTop: 22 }}>{weekday}</div>
            {dayMonth ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 92,
                  fontWeight: 800,
                  letterSpacing: -3,
                  lineHeight: 1.08,
                  backgroundImage: `linear-gradient(90deg, ${c1}, ${c2})`,
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {dayMonth}
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: 26 }}>
              {route.map((area, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center" }}>
                  {i ? <div style={{ display: "flex", margin: "0 12px", fontSize: 28, fontWeight: 800, color: c1 }}>→</div> : null}
                  <div
                    style={{
                      display: "flex",
                      fontSize: 24,
                      fontWeight: 600,
                      padding: "8px 18px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.07)",
                    }}
                  >
                    {area}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 54,
                height: 54,
                borderRadius: 16,
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
              <img src={OG_MARK} width={34} height={34} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={OG_WORDMARK} width={126} height={46} style={{ marginLeft: 14 }} />
            {/*
              The total used to sit here, and a preview is the worst place for
              it: it shows in the chat before anyone taps, so a plan made for
              two announced its own cost to the person it was made for. The
              start time says the useful thing and gives nothing away.
            */}
            <div style={{ display: "flex", fontSize: 24, fontWeight: 600, marginLeft: 26, color: "rgba(247,233,240,0.7)" }}>
              {stops.length} stop{stops.length === 1 ? "" : "s"} · from {time12(inputs.startTime)}
            </div>
          </div>
        </div>

        {/* ── right: the stops, as the page's cards ── */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 29,
              top: 70,
              bottom: 70,
              width: 4,
              borderRadius: 4,
              background: `linear-gradient(180deg, ${c1}, ${c2})`,
              opacity: 0.6,
            }}
          />
          {shown.map((st, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", marginTop: i ? 18 : 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 62,
                  height: 62,
                  borderRadius: 20,
                  background: `linear-gradient(135deg, ${c1}, ${c2})`,
                  fontSize: 26,
                  fontWeight: 800,
                  color: "#1A0D14",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  marginLeft: 18,
                  padding: "16px 22px",
                  borderRadius: 22,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.07)",
                }}
              >
                {/*
                  Fixed and non-wrapping. A wrapped time or name pushes the rest
                  off the bottom, and an overflowing preview is simply a cropped
                  one: nothing warns you, it is just missing.
                */}
                <div style={{ display: "flex", fontSize: 21, fontWeight: 800, color: c1, whiteSpace: "nowrap" }}>{st.arrival_time}</div>
                <div style={{ display: "flex", fontSize: 29, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 340 }}>
                  {st.name}
                </div>
              </div>
            </div>
          ))}
          {stops.length > shown.length ? (
            <div style={{ display: "flex", marginTop: 14, marginLeft: 80, fontSize: 22, fontWeight: 600, color: "rgba(247,233,240,0.6)" }}>
              + {stops.length - shown.length} more
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
