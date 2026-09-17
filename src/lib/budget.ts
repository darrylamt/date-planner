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
