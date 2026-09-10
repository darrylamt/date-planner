import { ghs, longDate } from "./format";
import type { Itinerary } from "./types";

/**
 * The plan as an email.
 *
 * A share link is the right thing to send someone in a chat, but an email is
 * often going to a person who wants the whole thing in front of them — a
 * friend deciding whether to come, or the organiser keeping a record. So the
 * body carries the actual itinerary rather than only a URL, and still links
 * back for the live version.
 *
 * Written as plain text on purpose: every mail client renders it, and a plan
 * that arrives as a wall of broken HTML is worse than one that arrives plain.
 */
export function planEmail(
  itinerary: Itinerary,
  date: string,
  url: string | null
): { subject: string; body: string } {
  const lines: string[] = [];

  lines.push(itinerary.title);
  lines.push(longDate(date));
  if (itinerary.summary_route) lines.push(itinerary.summary_route);
  lines.push("");

  itinerary.stops.forEach((stop, i) => {
    lines.push(`${i + 1}. ${stop.arrival_time} — ${stop.name}${stop.area ? `, ${stop.area}` : ""}`);
    if (stop.label) lines.push(`   ${stop.label}`);
    if (stop.what_to_do) lines.push(`   ${stop.what_to_do}`);

    stop.orders.forEach((o) => {
      lines.push(`   · ${o.item}${o.qty > 1 ? ` ×${o.qty}` : ""} — ${ghs(Number(o.price_ghs))}`);
    });

    // A genuinely free stop should say so rather than show nothing at all.
    if (!stop.orders.length) lines.push("   · Free to enter");

    const hop = itinerary.hops[i];
    if (hop && i < itinerary.stops.length - 1) {
      lines.push(`   ↓ about ${hop.mins} min, ${ghs(Number(hop.cost_ghs))}`);
    }
    lines.push("");
  });

  lines.push(`Food and entry: ${ghs(Number(itinerary.food_total_ghs))}`);
  lines.push(`Transport: ${ghs(Number(itinerary.transport_total_ghs))}`);
  lines.push(`Total: ${ghs(Number(itinerary.est_total_ghs))}`);

  if (itinerary.budget_note) {
    lines.push("");
    lines.push(itinerary.budget_note);
  }

  if (url) {
    lines.push("");
    lines.push(`See it online: ${url}`);
  }

  lines.push("");
  lines.push("Planned with aduro. Menu prices are from our catalog and can change.");

  return {
    subject: `${itinerary.title} — ${longDate(date)}`,
    body: lines.join("\n"),
  };
}

/** A mailto: URL for the plan, with recipients optional. */
export function planMailto(
  itinerary: Itinerary,
  date: string,
  url: string | null,
  to = ""
): string {
  const { subject, body } = planEmail(itinerary, date, url);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
