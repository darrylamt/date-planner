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
