import { ImageResponse } from "next/og";
import { createCatalogClient } from "@/lib/supabase/server";
import { weekendPicks } from "@/lib/weekendPost";

/*
 * The weekend post's pictures, 1080 x 1350 (Instagram portrait): ?i=0 is the
 * cover listing all five, ?i=1..5 one pick each with its photo. Built from
 * the same picks as Admin → Weekend post, so the words and pictures agree.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

const ROSE = "#E11D48";
const AMBER = "#FFB547";
const NIGHT = "#0C0A16";

/** The brand faces (OFL), from public/fonts/og; the generator's own font has neither bold nor the cedi sign. */
async function fonts(origin: string) {
  const load = async (file: string) => (await fetch(`${origin}/fonts/og/${file}`)).arrayBuffer();
  const [regular, bold, display] = await Promise.all([load("Figtree_400Regular.ttf"), load("Figtree_700Bold.ttf"), load("BricolageGrotesque_800ExtraBold.ttf")]);
  return [
    { name: "Figtree", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Figtree", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Bricolage", data: display, weight: 800 as const, style: "normal" as const },
  ];
}

/** "GH₵50" as "GHS 50": the cedi sign is missing from these fonts. */
const cedis = (t: string | null) => (t ? t.replace(/GH₵\s?/g, "GHS ") : t);

const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const i = Math.max(0, Math.min(5, Number(url.searchParams.get("i") ?? 0) || 0));
  const { days, picks } = await weekendPicks(createCatalogClient());
  const range = `${dateLabel(days[0])} to ${dateLabel(days[2])}`;
  const size = { width: 1080, height: 1350, fonts: await fonts(url.origin) };

  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", fontSize: 58, fontWeight: 800, letterSpacing: -1, fontFamily: "Bricolage" }}>Duro!</div>
      <div style={{ display: "flex", fontSize: 34, color: "rgba(255,255,255,0.75)" }}>Plan the night: duroplans.com</div>
    </div>
  );

  if (i === 0 || !picks[i - 1]) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 80, background: `linear-gradient(160deg, #3B0A1C 0%, ${NIGHT} 45%, #2A1A06 100%)`, color: "#FFFFFF", fontFamily: "Figtree" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: 6, color: AMBER }}>{range.toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 128, fontWeight: 800, lineHeight: 0.98, marginTop: 24, fontFamily: "Bricolage" }}>
            <span>This weekend</span>
            <span>in Accra.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 60, gap: 22 }}>
            {picks.map((p, n) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 26 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 32, background: n % 2 ? AMBER : ROSE, color: n % 2 ? NIGHT : "#FFFFFF", fontSize: 32, fontWeight: 800 }}>{n + 1}</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 42, fontWeight: 700 }}>{p.title.length > 34 ? `${p.title.slice(0, 33)}…` : p.title}</div>
                  <div style={{ display: "flex", fontSize: 28, color: "rgba(255,255,255,0.7)" }}>{[p.when, cedis(p.price)].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "auto" }}>{footer}</div>
        </div>
      ),
      size
    );
  }

  const p = picks[i - 1];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: NIGHT, color: "#FFFFFF", fontFamily: "Figtree" }}>
        <div style={{ display: "flex", position: "relative", width: "100%", height: 820 }}>
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" width={1080} height={820} style={{ width: 1080, height: 820, objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: 1080, height: 820, background: `radial-gradient(circle at 20% 10%, ${ROSE}, transparent 60%), ${NIGHT}` }} />
          )}
          <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: 360, background: `linear-gradient(to top, ${NIGHT}, transparent)` }} />
          <div style={{ display: "flex", position: "absolute", top: 50, left: 60, padding: "14px 28px", borderRadius: 999, background: ROSE, fontSize: 30, fontWeight: 700 }}>
            {`${i} of ${picks.length} · This weekend in Accra`}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "0 70px 70px", marginTop: -40, flex: 1 }}>
          <div style={{ display: "flex", fontSize: p.title.length > 30 ? 66 : 84, fontWeight: 800, lineHeight: 1.02, fontFamily: "Bricolage" }}>{p.title}</div>
          <div style={{ display: "flex", fontSize: 36, color: "rgba(255,255,255,0.75)", marginTop: 18 }}>{[p.where, p.when].filter(Boolean).join(" · ")}</div>
          {p.price ? (
            <div style={{ display: "flex", marginTop: 26 }}>
              <div style={{ display: "flex", padding: "14px 30px", borderRadius: 999, background: AMBER, color: NIGHT, fontSize: 36, fontWeight: 700 }}>{cedis(p.price)}</div>
            </div>
          ) : null}
          <div style={{ display: "flex", marginTop: "auto" }}>{footer}</div>
        </div>
      </div>
    ),
    size
  );
}
