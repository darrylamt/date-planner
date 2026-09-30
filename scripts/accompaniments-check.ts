import { isBase, needsBase, pickBase } from "../src/lib/accompaniments";

let fails = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} -> ${String(got)}`);
};
const m = (name: string, category = "main", notes: string | null = null) => ({ name, category: category as any, notes, price_ghs: 50 });

// needs a base
t("egg stew", needsBase(m("Egg Stew")), true);
t("palava sauce", needsBase(m("Palava Sauce")), true);
t("light soup with goat", needsBase(m("Light Soup with Goat")), true);
t("okro stew", needsBase(m("Okro Stew")), true);
t("fish in oyster sauce", needsBase(m("Fish in Oyster Sauce")), true);
t("black pepper beef sauce", needsBase(m("Black Pepper Beef Sauce")), true);
// complete or not a stew
t("egg stew with yam", needsBase(m("Egg Stew with Boiled Yam")), false);
t("kontomire, notes say rice", needsBase(m("Kontomire", "main", "Served with rice or yam")), false);
t("hot sauce wings", needsBase(m("Hot Sauce Wings (6pcs)")), false);
t("beef noodle soup", needsBase(m("Sichuan Beef Soup Noodles")), false);
t("cocktail sauce extra", needsBase(m("Extra Top Up - Cocktail Sauce", "other")), false);
t("teriyaki sauce condiment", needsBase(m("Teriyaki Sauce", "other")), false);
t("pumpkin soup starter", needsBase(m("Pumpkin Soup", "starter")), false);
t("pasta in cream sauce", needsBase(m("Chicken Pasta in Cream Sauce")), false);
// bases
t("plain rice (starter)", isBase(m("Plain Rice", "starter")), true);
t("steamed rice (main)", isBase(m("Steamed Rice", "main")), true);
t("boiled yam (other)", isBase(m("Boiled Yam", "other")), true);
t("banku / kenkey", isBase(m("Banku / Kenkey (2 Balls)", "other")), true);
t("jollof rice side", isBase(m("Jollof Rice Side", "other")), true);
t("extra top up banku", isBase(m("Extra Top Up - Banku", "other")), true);
t("chicken fried rice is a meal", isBase(m("Chicken Fried Rice", "main")), false);
t("jollof rice main is a meal", isBase(m("Jollof Rice", "main")), false);
t("gari fortor with tilapia is a meal", isBase(m("Gari Fortor, Plantain and Tilapia", "main")), false);
t("overloaded yam chips is a dish", isBase(m("Overloaded Yam Chips", "starter")), false);
t("yam sorbet dessert", isBase(m("Asana Yam Sorbet", "dessert")), false);
t("vodka potato drink", isBase(m("Kartoff Vodka Potato", "drink")), false);
// pairing
const sides = [m("Plain Rice", "other"), m("Boiled Yam", "other"), m("Banku", "other"), m("Fufu", "other"), m("Fried Plantain", "other")];
t("egg stew -> rice", pickBase(m("Egg Stew"), sides)?.name, "Plain Rice");
t("palava -> yam", pickBase(m("Palava Sauce"), sides)?.name, "Boiled Yam");
t("light soup -> fufu", pickBase(m("Light Soup"), sides)?.name, "Fufu");
t("okro -> banku", pickBase(m("Okro Stew"), sides)?.name, "Banku");
t("continental with truffle sauce is plated", needsBase(m("Smoked Chicken with Truffle Mushroom Sauce")), false);
t("beef with black bean sauce wants rice", needsBase(m("Beef with Black Bean Sauce")), true);
t("korean description in brackets", needsBase(m("Dakbal (Stir-fried Chicken Feet in a Hot Sauce)")), false);
t("waakye stew wants waakye", needsBase(m("Waakye Stew")), true);
t("waakye + goat stew is whole", needsBase(m("Waakye + Goat Meat Stew (Saturday Only)")), false);
t("oxtail stew with pilaf is whole", needsBase(m("Special Ox- Tail Stew with Braised Pilaf")), false);
t("quarter chicken only", needsBase(m("Quarter Chicken Only")), true);
t("side dishes catch-all", isBase(m("Side Dishes (Rice, Chips, Etc.)", "other")), true);
t("banku & okro is a plate", isBase(m("Banku & Okro (Chicken)")), false);
t("rice cake add-on is not a side", isBase(m("Add-on Rice Cake", "other")), false);
t("waakye stew -> waakye", pickBase(m("Waakye Stew"), [...sides, m("Waakye", "main")])?.name, "Waakye");
console.log(fails ? `${fails} failed` : "all passed");
