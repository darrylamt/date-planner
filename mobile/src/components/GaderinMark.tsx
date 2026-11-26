import { Image, type ImageSourcePropType } from "react-native";

/*
 * The ticketing site's own mark on its tickets buttons (owner, 26 Nov 2026):
 * a booking that goes to Gaderin, Aya Tickets or passa says so with that
 * site's logo rather than a ticket. Gaderin's and Aya's sit on a white
 * rounded badge so they read on any button colour; passa's is its own ticket.
 */
export type TicketBrand = "gaderin" | "aya" | "passa";

const MARKS: Record<TicketBrand, ImageSourcePropType> = {
  gaderin: require("../../assets/brands/gaderin.png"),
  aya: require("../../assets/brands/aya.png"),
  passa: require("../../assets/brands/passa.png"),
};

/** Which site a ticket link goes to, when it is one with a mark. */
export function ticketBrand(url: string | null | undefined): TicketBrand | null {
  const u = url ?? "";
  if (/(^|\/\/|\.)thegaderin\.com/i.test(u)) return "gaderin";
  if (/(^|\/\/|\.)ayatickets\.com/i.test(u)) return "aya";
  if (/(^|\/\/|\.)passa\.live/i.test(u)) return "passa";
  return null;
}

export function TicketMark({ brand, size = 18 }: { brand: TicketBrand; size?: number }) {
  return <Image source={MARKS[brand]} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}
