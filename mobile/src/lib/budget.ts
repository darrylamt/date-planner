/**
 * GENERATED, do not edit. Mirrored from src/lib/budget.ts.
 *
 * Run `npm run mirror` after changing the web copy.
 */
/**
 * Budget bounds, single source of truth for the schema, the web slider and
 * the mobile slider. Mirrored to mobile/src/lib/budget.ts.
 *
 * The ceiling is a validation guard, not a judgement about what an evening
 * should cost: premium venues plus several stops clear GHS 3,000 easily, and
 * the old cap silently made those plans impossible to ask for.
 *
 * The floor is zero because a day out can genuinely cost nothing, a park, a
 * beach, a walk. Only venues flagged is_free can fill such a plan; a venue we
 * simply have no prices for is still withheld rather than shown as free.
 */
export const BUDGET_MIN = 0;
export const BUDGET_MAX = 10000;
export const BUDGET_STEP = 50;

/** Where the slider starts when someone drags it off zero. */
export const BUDGET_DEFAULT = 800;

/**
 * The per-head figure that means "nobody has set this".
 *
 * Twenty-nine live venues sat at exactly GHS 100 a head with no menu at all,
 * every one of them marked price_source 'menu': an import default, not a
 * price. The planner was booking them as "Typical spend, per person, GHS 100",
 * which is an invented bill. A venue at exactly this figure with no menu rows
 * is treated as unpriced and withheld until somebody edits the figure. A
 * place that genuinely costs 100 a head can say so by adding its menu, or by
 * marking the price 'estimated' in the admin.
 */
export const PLACEHOLDER_AVG_GHS = 100;

export function isPlaceholderAvg(
  v: { avg_cost_per_person_ghs?: number | null; price_source?: string | null },
  hasMenu: boolean
): boolean {
  return !hasMenu && Number(v.avg_cost_per_person_ghs) === PLACEHOLDER_AVG_GHS && v.price_source !== "estimated";
}

/**
 * Places to eat, priced from their menu or not at all.
 *
 * A restaurant, cafe or dessert place with no priced menu used to be planned
 * at its per-head figure, as "Typical spend, per person", and that line is
 * not something anybody orders: THE MIX and Pâte à choux showed it in plans.
 * A meal is chosen from a menu, so without one the place is left out until
 * its menu is uploaded, and comes back by itself when it is. Bars, activities
 * and outdoor places keep their per-head figure: entry or a round of drinks
 * really is one price a head.
 *
 * That holds for an estimate too. A place whose only published menu is on a
 * delivery app may carry price_source 'estimated' and a per-head range, which
 * Duro bot quotes as a range (see isPriced in chat/tools/shared.ts). Plans
 * leave it out: "Estimated spend, per person" at a restaurant was tried on 9
 * Oct and read as filler, three times in two plans.
 */
export const MENU_ONLY_TYPES: ReadonlySet<string> = new Set(["restaurant", "cafe", "dessert"]);

/**
 * The kinds of place that can honestly be free to be at: a gallery, a
 * library, a beach, a park. Never a bar or a restaurant, whatever the flag
 * says. Beehive was ticked free and went into plans at GHS 0 with nothing to
 * order, which is a table you sit at without buying anything.
 */
export const FREE_TYPES: ReadonlySet<string> = new Set(["activity", "outdoor"]);

/** Free to visit: flagged so, and a kind of place where that can be true. */
export function freeToVisit(v: { type?: string | null; is_free?: boolean | null }): boolean {
  return v.is_free === true && FREE_TYPES.has(String(v.type ?? ""));
}

/** Whether a venue's per-head figure must not be used as its price. */
export function avgIsNotAPrice(
  v: { type?: string | null; avg_cost_per_person_ghs?: number | null; price_source?: string | null },
  hasMenu: boolean
): boolean {
  return isPlaceholderAvg(v, hasMenu) || (!hasMenu && MENU_ONLY_TYPES.has(String(v.type ?? "")));
}

/**
 * Whether this plan pays for taxis between stops.
 *
 * Two ways to arrive at no: saying you are driving, and setting the budget to
 * zero. The second is not an inference about the person, it is arithmetic,
 * nothing at zero can pay a fare, so a plan that still charged for hops would
 * be unbuildable for a reason it never explained.
 *
 * One function rather than the same condition written in the planner, the
 * route, the budget bar and the hop pill. Four copies of a rule is four
 * chances for the meter to disagree with the plan it is metering.
 */
export function isDriving(inputs: { driving?: boolean; budget: number }): boolean {
  return inputs.driving === true || inputs.budget <= 0;
}

/* ── what a venue adds to the bill ────────────────────────────────────── */

const pct = (n: number) => String(Math.round(n * 100) / 100);

/** What the orders come to, leaving out the door, which nothing is added to. */
export function chargeableSubtotal(orders: { price_ghs: number; door?: boolean }[]): number {
  return orders.filter((o) => !o.door).reduce((sum, o) => sum + Number(o.price_ghs), 0);
}

/**
 * The lines a venue adds to a bill of this size.
 *
 * Service on the subtotal, then tax on the subtotal and the service together,
 * the way bills in Accra are written. Nothing recorded adds nothing, so a
 * venue nobody has checked costs exactly what it did before.
 */
export function chargesOn(
  subtotal: number,
  rates: { service_pct?: number | null; tax_pct?: number | null } | null | undefined
): { label: string; ghs: number }[] {
  const out: { label: string; ghs: number }[] = [];
  const service = Number(rates?.service_pct ?? 0);
  const tax = Number(rates?.tax_pct ?? 0);
  if (!(subtotal > 0)) return out;
  let serviceGhs = 0;
  if (service > 0) {
    serviceGhs = Math.round((subtotal * service) / 100);
    out.push({ label: `Service charge ${pct(service)}%`, ghs: serviceGhs });
  }
  if (tax > 0) {
    out.push({ label: `VAT and levies ${pct(tax)}%`, ghs: Math.round(((subtotal + serviceGhs) * tax) / 100) });
  }
  return out;
}

export function chargesTotal(charges: { ghs: number }[] | null | undefined): number {
  return (charges ?? []).reduce((sum, c) => sum + Number(c.ghs), 0);
}
