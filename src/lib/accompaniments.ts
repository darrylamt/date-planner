import type { MenuItem } from "./types";

/**
 * Dishes that are eaten with something, and the somethings.
 *
 * Ghanaian menus list a stew, a sauce or a soup on its own line and the rice,
 * yam, banku or fufu it is eaten with on another, and so do the Chinese menus
 * in Accra ("Fish in Oyster Sauce", then "Steamed Rice"). Read line by line,
 * a date for two was ordered an egg stew and a palava sauce and nothing to
 * eat them with, which is not a meal anybody orders. And the sides, filed as
 * mains or starters on plenty of menus, could be ordered as a meal on their
 * own: a plate of plain rice for dinner.
 *
 * Read from names alone, because that is all a menu gives, so both rules are
 * narrow on purpose. A dish that names its base ("with rice", "and yam",
 * noodles, pasta) is complete; a sauce only counts when it names a protein,
 * so a GHS 10 cocktail sauce is still a condiment; a side is plain starch
 * with no protein in it, so "Chicken Fried Rice" stays a meal.
 */

const STARCH =
  /\b(rice|yam|plantains?|banku|fufu|kenkey|gari|garri|ampesi|konkonte|tuo( zaafi)?|tuwo|omotuo|attieke|cocoyam|potato(es)?|chips|fries|bread|rice balls?|pilaf|pilau|waakye|eba|amala|semo(vita)?|couscous)\b/i;
const PROTEIN = /\b(chicken|beef|fish|tilapia|salmon|prawns?|shrimps?|seafood|squid|calamari|crab|lobster|goat|mutton|lamb|pork|turkey|duck|sausages?|gizzard|wele|tofu|snail|egg)\b/i;
const LOCAL_STEW =
  /\b(stew|palava|palaver|kontomire|nkwan|abunuabunu|light soup|groundnut soup|peanut soup|palm ?nut soup|goat soup|okro|okra|garden egg|egusi|agushie|efo|efo riro|ogbono|edikaikong|afang|banga)\b/i;
/*
 * A dish that already has its base, or is a whole dish of another kind. Not
 * "with" on its own: "Light Soup with Goat" names its meat, not its fufu.
 */
const COMPLETE =
  /\b(noodles?|pasta|spaghetti|macaroni|couscous|burger|sandwich|wrap|pizza|salad|tacos?|shawarma|wings?|dip|choice of|side)\b/i;
const EXTRA = /\b(extra|add[- ]?on|top ?up)\b/i;

/** A stew, soup or protein-in-sauce dish with nothing to eat it with. */
export function needsBase(m: Pick<MenuItem, "name" | "notes" | "category">): boolean {
  if (m.category !== "main" && m.category !== "other") return false;
  if (EXTRA.test(m.name)) return false;
  /*
   * The name itself, not the description in brackets: Korean menus explain
   * "Dakbal (stir-fried chicken feet in a hot sauce)", and that is a whole
   * dish, not a sauce waiting for rice.
   */
  const head = m.name.replace(/\(.*?\)/g, " ");
  /*
   * A starch naming the stew is not its base: "Waakye Stew" is the stew you
   * pour on waakye, and still wants the waakye.
   */
  const text = `${head} ${m.notes ?? ""}`.replace(/\b(waakye|rice|beans?)\s+(stew|sauce)\b/gi, "$2");
  if (COMPLETE.test(text) || STARCH.test(text)) return false;
  if (LOCAL_STEW.test(head)) return true;
  // "Quarter Chicken Only", "Goat Only": the meat, sold without its plate.
  if (/\bonly\b/i.test(head) && PROTEIN.test(head)) return true;
  if (!/\bsauce\b/i.test(head) || !PROTEIN.test(head)) return false;
  /*
   * Which sauce dishes want rice. "Fish in Oyster Sauce", "Beef Sauce" and
   * anything in a Chinese-style sauce do; a continental plate "with a
   * truffle mushroom sauce" arrives garnished and does not.
   */
  return /\bin\b[^()]*\bsauce\b/i.test(head) || !/\bwith\b/i.test(head) || PAIRED_SAUCE.test(head);
}

const PAIRED_SAUCE =
  /\b(oyster|black bean|szechuan|sichuan|hoisin|sweet (and|&) sour|kung pao|teriyaki|soy|garlic|ginger|chil+i|pepper|curry|stir[- ]?fry|brown)\b[^()]*\bsauce\b/i;

const PLAIN = /\b(plain|white|steamed|boiled)\b/i;
const tidy = (name: string) =>
  name
    .toLowerCase()
    .replace(/^(extra( top up)?|add[- ]?on|side of)\s*-?\s*/, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s+side$/, "")
    .trim();

/** Plain starch: a side to eat a stew with, not a meal on its own. */
export function isBase(m: Pick<MenuItem, "name" | "category">): boolean {
  if (m.category === "drink" || m.category === "dessert" || m.category === "activity") return false;
  // A catch-all line: "Side Dishes (Rice, Chips, Etc.)".
  if (/^(side dish(es)?|sides?)\b/i.test(m.name.trim()) && STARCH.test(m.name)) return true;
  const name = tidy(m.name);
  if (!STARCH.test(name) || PROTEIN.test(name.replace(/\begg (fried )?rice\b/, "rice"))) return false;
  if (name.split(/\s+/).length > 4) return false;
  // Two foods joined is a plate, not a side: "Banku & Okro", "Rice and Stew".
  if (/&|\+|,|\band\b|\bwith\b/.test(name) || LOCAL_STEW.test(name) || /\b(soup|sauce)\b/.test(name)) return false;
  // "Loaded", "cheesy", "balls", "sorbet", "cake": dishes made of a starch, not sides.
  if (/\b(loaded|overloaded|cheesy|balls?|katsu|sorbet|salad|crisp|nachos|cake|pudding|pie)\b/.test(name)) return false;
  return (
    m.category === "other" ||
    PLAIN.test(name) ||
    /^(banku|fufu|kenkey|gari|garri|ampesi|omotuo|tuo( zaafi)?|tuwo|attieke|rice balls?|waakye|eba|amala|semo(vita)?|pounded yam)\b/.test(name)
  );
}

/*
 * What each kind of dish is eaten with, best first. Soups want something to
 * swallow, okro wants banku, palava and garden egg want yam or plantain, and
 * a stew or a sauce wants rice before anything else.
 */
const PAIRS: { dish: RegExp; bases: RegExp[] }[] = [
  { dish: /\bwaakye\b/i, bases: [/waakye/i, /rice/i] },
  { dish: /\b(soup|nkwan|abunuabunu|ogbono|edikaikong|afang|banga)\b/i, bases: [/fufu|pounded yam/i, /banku/i, /eba|garri|amala|semo|tuwo/i, /omotuo|rice balls?/i, /kenkey/i, /rice/i] },
  { dish: /\b(okro|okra)\b/i, bases: [/banku/i, /fufu|pounded yam/i, /eba|garri|amala|semo/i, /kenkey/i, /rice/i] },
  { dish: /\b(palava|palaver|kontomire|garden egg|egusi|agushie|efo)\b/i, bases: [/boiled yam|yam/i, /plantain|ampesi/i, /eba|pounded yam|fufu/i, /banku/i, /rice/i] },
  { dish: /./, bases: [/rice/i, /yam/i, /plantain/i, /banku/i, /chips|fries|potato/i] },
];

/** The side a dish is most likely eaten with, from what this menu sells. */
export function pickBase<T extends Pick<MenuItem, "name" | "price_ghs">>(dish: Pick<MenuItem, "name">, bases: T[]): T | null {
  if (!bases.length) return null;
  const order = PAIRS.find((p) => p.dish.test(dish.name))!.bases;
  const rank = (b: T) => {
    const i = order.findIndex((re) => re.test(b.name));
    return (i === -1 ? order.length : i) * 10 + (PLAIN.test(b.name) ? 0 : 1);
  };
  return [...bases].sort((a, b) => rank(a) - rank(b) || Number(a.price_ghs) - Number(b.price_ghs))[0];
}
