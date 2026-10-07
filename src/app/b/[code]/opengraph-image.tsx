import { ImageResponse } from "next/og";
import { ghs } from "@/lib/format";
import { isMeName, readBill } from "@/lib/billLink";
import { OG_WORDMARK } from "@/lib/brandImages";

export const alt = "A bill split on Duro!";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function font(weight: 600 | 800): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/figtree@latest/latin-${weight}-normal.woff`);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/**
 * What the bill looks like in the group chat before anybody taps: a receipt,
 * the total large, each person's share down the right, and who paid. The
 * preview is most of what a share is, so it says the useful thing on its own.
 */
export default async function Image({ params }: { params: { code: string } }) {
  const bill = readBill(params.code);
  const [semi, bold] = await Promise.all([font(600), font(800)]);
  const fonts = [
    ...(semi ? [{ name: "Figtree", data: semi, weight: 600 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Figtree", data: bold, weight: 800 as const, style: "normal" as const }] : []),
  ];
  const family = fonts.length ? "Figtree" : "sans-serif";
  const shown = (n: string) => (isMeName(n) ? "Sender" : n);
  const rows = bill ? bill.p.slice(0, 6) : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "56px 64px",
          backgroundColor: "#140B0D",
          backgroundImage: "radial-gradient(circle at 18% 22%, #E23D6D55, transparent 55%), radial-gradient(circle at 85% 90%, #E5B04E40, transparent 55%)",
          color: "#F7E9F0",
          fontFamily: family,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={OG_WORDMARK} width={230} height={84} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#E5B04E", letterSpacing: 2 }}>🧾 THE BILL</div>
            <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>{bill ? ghs(bill.c) : "Split it"}</div>
            <div style={{ fontSize: 36, fontWeight: 600, color: "#D6AFC1", marginTop: 10 }}>
              {bill ? `split ${bill.p.length} ways · ${shown(bill.p[bill.w][0])} paid` : "on Duro!"}
            </div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, color: "#A87E92" }}>Tap to see your share</div>
        </div>

        {bill ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 430,
              marginLeft: 40,
              padding: "26px 30px",
              borderRadius: 32,
              backgroundColor: "#FFF8F3",
              color: "#1C1216",
              justifyContent: "center",
            }}
          >
            {rows.map(([name, share], i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "13px 0",
                  borderBottom: i < rows.length - 1 ? "2px dashed #E9DFDA" : "none",
                  fontSize: 32,
                  fontWeight: i === bill.w ? 800 : 600,
                }}
              >
                <span style={{ display: "flex" }}>
                  {shown(name).slice(0, 14)}
                  {i === bill.w ? <span style={{ marginLeft: 10, fontSize: 20, color: "#C92C58", alignSelf: "center" }}>PAID</span> : null}
                </span>
                <span>{ghs(share)}</span>
              </div>
            ))}
            {bill.p.length > rows.length ? (
              <div style={{ display: "flex", fontSize: 24, color: "#6A5A61", marginTop: 10 }}>and {bill.p.length - rows.length} more</div>
            ) : null}
          </div>
        ) : null}
      </div>
    ),
    { ...size, fonts }
  );
}
