/**
 * MIRRORED from the web app: ../../src/lib/budget.ts
 * Keep in step — the server validates against its copy.
 */
/**
 * Budget bounds — single source of truth for the schema, the web slider and
 * the mobile slider. Mirrored to mobile/src/lib/budget.ts.
 *
 * The ceiling is a validation guard, not a judgement about what an evening
 * should cost: premium venues plus several stops clear GHS 3,000 easily, and
 * the old cap silently made those plans impossible to ask for.
 */
export const BUDGET_MIN = 100;
export const BUDGET_MAX = 10000;
export const BUDGET_STEP = 50;
