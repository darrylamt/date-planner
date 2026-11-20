import React from "react";
import { ImageResponse } from "next/og";

/*
 * The giveaway winner's ticket as a picture to keep in their photos
 * (/win/<token>/ticket, "Save the ticket"). The QR is drawn from the
 * ticket's own modules, black on white with a wide quiet zone, so a gate
 * scanner reads it first time. React is imported for scripts that render it.
 */
async function fonts(origin: string) {
  const load = async (file: string) => (await fetch(`${origin}/fonts/og/${file}`)).arrayBuffer();
  const [regular, bold] = await Promise.all([load("Figtree_400Regular.ttf"), load("Figtree_700Bold.ttf")]);
  return [
    { name: "Figtree", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Figtree", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

export async function renderTicketImage(
  t: { qr: string; title: string | null; when: string | null; venue: string | null },
  origin: string,
): Promise<ImageResponse> {
  const rows = t.qr.split(",");
  const cell = Math.floor(640 / (rows.length + 8));
  const res = new ImageResponse(
    (
      <div style={{ width: 1080, height: 1350, display: "flex", flexDirection: "column", alignItems: "center", background: "#ffffff", fontFamily: "Figtree", color: "#0B0B0F", padding: 72 }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: "#E11D48" }}>DURO! GIVEAWAY</div>
        <div style={{ marginTop: 18, fontSize: 64, fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>{t.title ?? "Your ticket"}</div>
        <div style={{ marginTop: 14, fontSize: 32, color: "#5E6270" }}>{[t.when, t.venue].filter(Boolean).join(" · ")}</div>
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", padding: cell * 4, background: "#ffffff", border: "2px solid #ECEDF1", borderRadius: 32 }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: "flex" }}>
              {[...row].map((bit, c) => (
                <div key={c} style={{ width: cell, height: cell, background: bit === "1" ? "#000000" : "#ffffff" }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 36, fontSize: 34, fontWeight: 700 }}>Admits one. Show this at the gate.</div>
        <div style={{ marginTop: 10, fontSize: 26, color: "#5E6270" }}>duroplans.com</div>
      </div>
    ),
    { width: 1080, height: 1350, fonts: await fonts(origin) },
  );
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Content-Disposition", 'inline; filename="duro-ticket.png"');
  return res;
}
