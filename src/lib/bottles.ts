import type { MenuItem } from "./types";

/**
 * Drinks one person orders, as opposed to the bottle for the table.
 *
 * Wine lists and spirits menus sell the same thing by the glass and by the
 * bottle, and many write the bottle as a bare name: Saint Pablo listed
 * "Absolut Vodka" at GHS 40 and again at GHS 2,500. Counted as one person's
 * drink, half the Churchill's drinks list was bottles, the middle of it sat
 * at GHS 520, and a plan ordering "a drink each at a typical order" reached
 * for a bottle of wine per head.
 *
 * Two tests. A name that says bottle, jug, tower, bucket or a bottle's size
 * is a bottle, and so is anything recorded as covering more than one person.
 * Then, on a list long enough to have a shape, anything over five times the
 * cheaper end of the list is set aside: a GHS 1,700 Hennessy between GHS 60
 * beers is a bottle whether or not the menu said so. A list made only of
 * bottles (a wine shop) keeps them all, because there is nothing smaller to
 * order instead.
 */
const BOTTLE =
  /\b(bottles?|btl|magnum|jeroboam|carafe|jugs?|pitchers?|towers?|buckets?|(70|75|100|150) ?cl|1(\.5)? ?(l|litre|liter)|700 ?ml|750 ?ml|1000 ?ml)\b/i;

export function isBottle(m: Pick<MenuItem, "name" | "covers_people">): boolean {
  return Math.max(1, Number(m.covers_people ?? 1)) > 1 || BOTTLE.test(m.name ?? "");
}

/** Of these drinks, the ones a person orders for themselves. */
export function byTheGlass<T extends Pick<MenuItem, "name" | "covers_people" | "price_ghs">>(drinks: T[]): T[] {
  const single = drinks.filter((m) => !isBottle(m));
  const prices = single
    .map((m) => Number(m.price_ghs))
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  if (prices.length < 8) return single.length ? single : drinks;
  const ceiling = prices[Math.floor(prices.length / 4)] * 5;
  const kept = single.filter((m) => Number(m.price_ghs) <= ceiling);
  return kept.length ? kept : single;
}
