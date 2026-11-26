import { Image } from "react-native";

/*
 * Gaderin's own "g", on its tickets buttons (owner, 26 Nov 2026): a booking
 * that goes to Gaderin says so with Gaderin's mark rather than a ticket. A
 * white rounded badge, so the orange reads on any button colour.
 */
export function GaderinMark({ size = 18 }: { size?: number }) {
  return <Image source={require("../../assets/brands/gaderin.png")} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}

/** Whether a ticket link goes to Gaderin. */
export const isGaderin = (url: string | null | undefined) => /(^|\/\/|\.)thegaderin\.com/i.test(url ?? "");
