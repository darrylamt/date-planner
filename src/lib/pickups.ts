import type { Occasion } from "./types";

/**
 * Flowers and cakes, collected on the way to the first stop.
 *
 * A pickup is an errand rather than a stop. It costs money and takes four
 * minutes, so it is added to the plan's total but never to its schedule, and
 * it appears above the itinerary rather than inside it.
 */
export type GiftKind = "flowers" | "cake";

export interface GiftVariant {
  id: string;
  label: string;
  price_ghs: number;
  magnitude: number | null;
}

export interface GiftProduct {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  variants: GiftVariant[];
}

export interface GiftVendor {
  id: string;
  name: string;
  kind: GiftKind;
  area: string | null;
  address: string | null;
  lead_time_hours: number;
  google_maps_url: string | null;
  products: GiftProduct[];
}

export interface PickupChoice {
  variantId: string;
  vendorName: string;
  productName: string;
  variantLabel: string;
  kind: GiftKind;
  quantity: number;
  priceGhs: number;
  message?: string;
  colour?: string;
  referenceImageUrl?: string;
}

/**
 * Which gifts an occasion should even offer.
 *
 * Not every occasion wants one, and offering a cake for a solo day is the app
 * inventing a reason to spend money. Graduation takes either: flowers for the
 * ceremony, a cake for the celebration after, and which one is a matter of how
 * the day is being marked rather than something to decide on their behalf.
 */
export const GIFTS_FOR_OCCASION: Record<Occasion, GiftKind[]> = {
  first_date: ["flowers"],
  date_night: ["flowers"],
  anniversary: ["flowers", "cake"],
  birthday: ["cake", "flowers"],
  graduation: ["flowers", "cake"],
  celebration: ["cake", "flowers"],
  friend_outing: ["cake"],
  solo_day: [],
};

export function giftsForOccasion(occasion: Occasion): GiftKind[] {
  return GIFTS_FOR_OCCASION[occasion] ?? [];
}

/**
 * Whether a vendor can actually have it ready in time.
 *
 * The whole reason lead_time_hours exists. A decorated cake often needs a day
 * or two, and an app that cheerfully says "collect a cake on your way" for an
 * evening three hours from now has arranged something that will not happen.
 * Measured from now to the start of the plan, not to the end of it.
 */
export function vendorCanDeliver(
  leadTimeHours: number,
  planDateISO: string,
  planStartTime: string,
  now: Date = new Date()
): boolean {
  const [y, m, d] = planDateISO.split("-").map(Number);
  const [hh, mm] = planStartTime.split(":").map(Number);
  if (!y || !m || !d) return false;

  const start = new Date(y, m - 1, d, hh ?? 12, mm ?? 0);
  const hoursAway = (start.getTime() - now.getTime()) / 3_600_000;
  return hoursAway >= leadTimeHours;
}

/** Human phrasing for how much notice a vendor wants. */
export function leadTimeLabel(hours: number): string {
  if (hours <= 0) return "Same day";
  if (hours < 24) return `${hours} hours notice`;
  const days = Math.round(hours / 24);
  return days === 1 ? "A day's notice" : `${days} days' notice`;
}

/** What a chosen pickup costs, quantity included. */
export function pickupTotal(choice: Pick<PickupChoice, "priceGhs" | "quantity">): number {
  return Math.round(choice.priceGhs * choice.quantity);
}

/**
 * The line that appears above the itinerary.
 *
 * Written rather than templated at the call site so the shared card, the app
 * and the email cannot describe the same pickup three different ways.
 */
export function pickupLine(choice: PickupChoice): string {
  const what =
    choice.quantity > 1
      ? `${choice.quantity} × ${choice.productName}, ${choice.variantLabel}`
      : `${choice.productName}, ${choice.variantLabel}`;
  return `${what} from ${choice.vendorName}`;
}
