import { longDate, time12 } from "./format";
import { OCCASION_THEME } from "./planConstants";
import type { Itinerary, PlanInputs } from "./types";

const APP_STORE = "https://apps.apple.com/gh/app/adurogh/id6809005685";

/**
 * The plan as an email.
 *
 * A share link is the right thing to send someone in a chat, but an email is
 * often going to a person who wants the whole thing in front of them, a
 * friend deciding whether to come, or the organiser keeping a record. So the
 * body carries the actual itinerary rather than only a URL, and still links
 * back for the live version.
 *
 * Written as plain text on purpose: every mail client renders it, and a plan
 * that arrives as a wall of broken HTML is worse than one that arrives plain.
 *
 * No money anywhere, the same rule as the shared page: the email goes to the
 * people being taken out, and what the evening costs is the one thing the
 * sender did not mean to tell them. The dishes and activities are named, so
 * they know what is coming; every figure stays in the sender's own app.
 */
export function planEmail(
  itinerary: Itinerary,
  date: string,
  url: string | null,
  note: string | null = null
): { subject: string; body: string } {
  const lines: string[] = [];

  if (note) {
    lines.push(`"${note}"`);
    lines.push("");
  }
  lines.push(itinerary.title);
  lines.push(longDate(date));
  if (itinerary.summary_route) lines.push(itinerary.summary_route);
  lines.push("");

  itinerary.stops.forEach((stop, i) => {
    lines.push(`${i + 1}. ${stop.arrival_time}, ${stop.name}${stop.area ? `, ${stop.area}` : ""}`);
    if (stop.label) lines.push(`   ${stop.label}`);
    if (stop.what_to_do) lines.push(`   ${stop.what_to_do}`);

    // What is on the order, by name. The door line says nothing without its figure.
    onThePlan(stop.orders).forEach((o) => {
      lines.push(`   · ${o.item}${o.qty > 1 ? ` ×${o.qty}` : ""}`);
    });

    const hop = itinerary.hops[i];
    if (hop && i < itinerary.stops.length - 1) {
      lines.push(`   ↓ about ${hop.mins} min to the next stop`);
    }
    lines.push("");
  });

  if (url) {
    lines.push(`See it online: ${url}`);
    lines.push("");
  }

  lines.push("Planned with aduro. A plan is a suggestion, not a booking.");

  return {
    subject: `${itinerary.title}, ${longDate(date)}`,
    body: lines.join("\n"),
  };
}

/** A mailto: URL for the plan, with recipients optional. */
export function planMailto(
  itinerary: Itinerary,
  date: string,
  url: string | null,
  to = "",
  note: string | null = null
): string {
  const { subject, body } = planEmail(itinerary, date, url, note);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

/**
 * What is on a stop's order that is worth naming: the dishes and activities,
 * not the door, which without its figure says nothing.
 */
function onThePlan(orders: Itinerary["stops"][number]["orders"]): { item: string; qty: number }[] {
  return orders.filter((o) => !o.door && o.qty > 0).map((o) => ({ item: o.item, qty: o.qty }));
}

/** Text from the catalogue or the sender, made safe to set inside HTML. */
function esc(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The plan as a designed email, for the phone's own Mail composer.
 *
 * Built the way mail clients need it, not the way a web page would be:
 * tables for layout, every style inline, a flat colour behind every gradient
 * for the clients that drop gradients, and nothing that needs a script or a
 * stylesheet. Light, because a dark email is inverted unpredictably by the
 * clients that apply their own dark mode.
 *
 * The same content as the plain version, in the same order, so which one a
 * phone sends changes how it looks and never what it says: no money in
 * either.
 */
export function planEmailHtml(
  itinerary: Itinerary,
  inputs: Pick<PlanInputs, "date" | "startTime" | "occasion">,
  url: string | null,
  note: string | null = null
): { subject: string; html: string } {
  const theme = OCCASION_THEME[inputs.occasion] ?? OCCASION_THEME.date_night;
  const accent = theme.accent;
  const glow = theme.accentDark;
  const ink = "#1C1216";
  const soft = "#6E5A63";
  const line = "#EFE4E8";
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const stops = itinerary.stops
    .map((stop, i) => {
      // What is on the order, by name only: no price, no charges, no door line.
      const dishes = onThePlan(stop.orders);
      const orders = dishes
        .map(
          (o) => `
                <tr>
                  <td style="padding:4px 0;font:15px ${font};color:${ink};">
                    <span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:${accent};vertical-align:middle;margin-right:10px;"></span>${esc(o.item)}${o.qty > 1 ? ` <span style="color:${soft};">&times;${o.qty}</span>` : ""}
                  </td>
                </tr>`
        )
        .join("");

      const hop = itinerary.hops[i];
      const ride =
        hop && i < itinerary.stops.length - 1
          ? `
          <tr>
            <td style="padding:14px 0 14px 18px;font:14px ${font};color:${soft};">
              <span style="display:inline-block;width:2px;height:22px;background:${glow};vertical-align:middle;margin-right:14px;"></span>
              About ${hop.mins} min to the next stop
            </td>
          </tr>`
          : "";

      return `
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${line};border-radius:18px;">
                <tr>
                  <td width="44" valign="top" style="padding:18px 0 18px 18px;">
                    <div style="width:36px;height:36px;line-height:36px;border-radius:12px;background:${accent};background-image:linear-gradient(135deg,${accent},${glow});color:#ffffff;font:700 16px ${font};text-align:center;">${i + 1}</div>
                  </td>
                  <td valign="top" style="padding:18px 18px 18px 12px;">
                    <div style="font:700 12px ${font};letter-spacing:1.2px;color:${accent};text-transform:uppercase;">${esc(stop.arrival_time)} &middot; ${esc(stop.event ? stop.event.title : stop.label)}</div>
                    <div style="font:800 20px ${font};color:${ink};margin-top:4px;">${esc(stop.name)}</div>
                    <div style="font:14px ${font};color:${soft};margin-top:2px;">${esc(stop.area)}</div>
                    ${stop.what_to_do ? `<div style="font:15px/1.5 ${font};color:${ink};margin-top:10px;">${esc(stop.what_to_do)}</div>` : ""}
                    ${
                      orders
                        ? `<div style="font:700 11px ${font};letter-spacing:1.2px;color:${soft};text-transform:uppercase;margin-top:14px;padding-top:12px;border-top:1px solid ${line};">On the plan</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
                      ${orders}
                    </table>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>${ride}`;
    })
    .join("");

  const button = url
    ? `
          <tr>
            <td align="center" style="padding:28px 0 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:999px;background:${accent};background-image:linear-gradient(100deg,${accent},${glow});">
                    <a href="${esc(url)}" style="display:inline-block;padding:15px 32px;font:700 16px ${font};color:#ffffff;text-decoration:none;border-radius:999px;">Open the live plan</a>
                  </td>
                </tr>
              </table>
              <div style="font:12px ${font};color:${soft};margin-top:10px;">Times, directions and anything that changes, kept up to date.</div>
            </td>
          </tr>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#F7F0F3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F0F3;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:26px;overflow:hidden;">
        <tr>
          <td style="background:${accent};background-image:linear-gradient(135deg,${accent} 0%,${glow} 100%);padding:30px 28px 28px;">
            <div style="font:700 12px ${font};letter-spacing:2px;color:rgba(255,255,255,0.85);text-transform:uppercase;">${esc(longDate(inputs.date))} &middot; from ${esc(time12(inputs.startTime))}</div>
            <div style="font:800 30px/1.15 ${font};color:#ffffff;margin-top:10px;">${esc(itinerary.title)}</div>
            ${itinerary.summary_route ? `<div style="font:15px ${font};color:rgba(255,255,255,0.92);margin-top:10px;">${esc(itinerary.summary_route)}</div>` : ""}
          </td>
        </tr>
        ${
          note
            ? `
        <tr>
          <td style="padding:24px 28px 0;">
            <div style="border-left:4px solid ${accent};background:#FBF4F7;border-radius:4px 14px 14px 4px;padding:14px 18px;">
              <div style="font:700 11px ${font};letter-spacing:1.4px;color:${accent};text-transform:uppercase;">A note for you</div>
              <div style="font:17px/1.5 ${font};color:${ink};margin-top:6px;">${esc(note)}</div>
            </div>
          </td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:24px 20px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${stops}
            </table>
          </td>
        </tr>
        ${button}
        <tr>
          <td style="padding:28px 28px 30px;text-align:center;">
            <div style="font:13px ${font};color:${soft};">Planned with</div>
            <div style="font:800 22px ${font};color:${ink};margin-top:2px;">adu<span style="color:${accent};">ro</span></div>
            <div style="font:13px ${font};margin-top:12px;"><a href="${APP_STORE}" style="color:${accent};font-weight:700;text-decoration:none;">Plan your own on the App Store &rarr;</a></div>
            <div style="font:11px/1.5 ${font};color:#A8969E;margin-top:14px;">A plan is a suggestion, not a booking.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject: `${itinerary.title}, ${longDate(inputs.date)}`, html };
}
