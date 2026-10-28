import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { PeriodPicker, periodFrom } from "@/components/admin/Period";
import { MEAL_PROBLEMS, checkMeals, type LoggedStop, type MealProblemKind } from "@/lib/mealChecks";
import type { MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PlanRow {
  created_at: string;
  occasion: string | null;
  party_size: number | null;
  weekday: number | null;
  orders: LoggedStop[] | null;
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");

/**
 * Meal quality: what real plans served, checked against the rules for an
 * intentional meal (mealChecks.ts). The weekly look at the planner's food,
 * from the dishes every plan has recorded since 0097. The team's own plans
 * are left out. A problem here is the planner's to-do list, or a menu to fix.
 */
export default async function AdminMealsPage({ searchParams }: { searchParams: { period?: string } }) {
  const db = await adminDataClient(["menus"]);
  const period = periodFrom(searchParams.period);

  const plans = await fetchAllRows<PlanRow>((a, b) => {
    let q = db
      .from("plan_demand")
      .select("created_at, occasion, party_size, weekday, orders")
      .not("orders", "is", null)
      .eq("team", false)
      .order("created_at", { ascending: false });
    if (period.since) q = q.gte("created_at", period.since);
    return q.range(a, b);
  }).catch(() => [] as PlanRow[]);

  // The menus those plans ordered from, a branch read from the kitchen it shares.
  const venueIds = [...new Set(plans.flatMap((p) => (p.orders ?? []).map((s) => s.venue_id)))];
  const venues: { id: string; name: string; menu_shared_from: string | null }[] = [];
  for (let i = 0; i < venueIds.length; i += 150) {
    const { data } = await db.from("venues").select("id, name, menu_shared_from").in("id", venueIds.slice(i, i + 150));
    venues.push(...((data ?? []) as typeof venues));
  }
  const owner = new Map(venues.map((v) => [v.id, v.menu_shared_from || v.id]));
  const name = new Map(venues.map((v) => [v.id, v.name]));
  const owners = [...new Set(venues.map((v) => v.menu_shared_from || v.id))];
  const menus = new Map<string, MenuItem[]>();
  for (let i = 0; i < owners.length; i += 60) {
    const rows = (await fetchAllRows<Record<string, unknown>>((a, b) =>
      db
        .from("menu_items")
        .select("venue_id, name, category, dish_role, meal_time, dish_type, drink_kind, dish_tags")
        .in("venue_id", owners.slice(i, i + 60))
        .order("id")
        .range(a, b)
    )) as unknown as MenuItem[];
    for (const m of rows) menus.set(m.venue_id, [...(menus.get(m.venue_id) ?? []), m]);
  }
  const menuOf = (venueId: string) => menus.get(owner.get(venueId) ?? venueId) ?? [];

  const tally = new Map<MealProblemKind, { plans: number; examples: { when: string; venue: string; detail: string }[] }>();
  let clean = 0;
  for (const p of plans) {
    const found = checkMeals(p.orders ?? [], menuOf, { occasion: p.occasion, party: p.party_size, weekday: p.weekday });
    if (!found.length) clean++;
    for (const kind of new Set(found.map((f) => f.kind))) {
      const t = tally.get(kind) ?? { plans: 0, examples: [] };
      t.plans++;
      for (const f of found.filter((x) => x.kind === kind)) {
        if (t.examples.length < 6) {
          t.examples.push({ when: p.created_at.slice(0, 10), venue: name.get(f.venueId) ?? "A venue", detail: f.detail });
        }
      }
      tally.set(kind, t);
    }
  }
  const rows = [...tally.entries()].sort((a, b) => b[1].plans - a[1].plans);

  return (
    <div className="max-w-[1000px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Meal quality</h1>
        <PeriodPicker path="/admin/meals" current={period.key} />
      </div>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        What real plans served, checked against the rules for a meal that makes sense: something to drink, no breakfast at
        dinner, no side as a plate, one dessert an evening, nothing twice. {period.heading}, the team&apos;s own plans left out.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Plans checked" value={String(plans.length)} note="with their dishes on record (since 0097)" />
        <Stat label="Every meal made sense" value={pct(clean, plans.length)} note={`${clean} of ${plans.length}`} />
        <Stat label="Kinds of problem" value={String(rows.length)} note="each counted once per plan" />
      </div>

      {plans.length === 0 ? (
        <div className="card mt-5 p-5 text-[14px]">No plans with their dishes on record in this period yet.</div>
      ) : rows.length === 0 ? (
        <div className="card mt-5 p-5 text-[14px]">Nothing to fix: every plan&apos;s food passed every check.</div>
      ) : (
        <div className="mt-5 grid gap-3">
          {rows.map(([kind, t]) => (
            <div key={kind} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-bold">{MEAL_PROBLEMS[kind]}</h2>
                <span className="text-[13px] text-mutedbrown">
                  {t.plans} plans · {pct(t.plans, plans.length)}
                </span>
              </div>
              <ul className="mt-2 grid gap-1 text-[13px]">
                {t.examples.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-mutedbrown">{e.when}</span>
                    <span className="font-semibold">{e.venue}</span>
                    <span className="min-w-0 truncate text-mutedbrown">{e.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-mutedbrown">{label}</div>
      <div className="mt-1 font-display text-[22px] font-bold">{value}</div>
      <div className="text-[12px] text-mutedbrown">{note}</div>
    </div>
  );
}
