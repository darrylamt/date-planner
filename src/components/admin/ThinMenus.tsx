"use client";

import Link from "next/link";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

interface Row {
  id: string;
  name: string;
  area: string;
  type: string;
  cuisine: string | null;
  /** The venue whose menu prices this one, when it is a branch. */
  sharedFrom: string | null;
  /** How many items sit in the bucket the planner would actually order from. */
  serves: number;
  servesLabel: string;
  /** Anything edible. Zero on a restaurant means the food menu is missing. */
  foodItems: number;
  mains: number;
  starters: number;
  desserts: number;
  drinks: number;
  other: number;
  total: number;
}

/** Fewer than this and a party is served the same handful whatever it asked for. */
const ENOUGH_MAINS = 5;

/**
 * Whether a table of six would be served six different things.
 *
 * Judged on the bucket the planner would actually draw from, not on main
 * courses. Asking "how many mains" of a bubble tea shop is the wrong question:
 * Daddy boba has thirty two drinks and no food and was being listed as needing
 * work on a menu it is never going to have.
 */
function verdict(r: Row): { label: string; className: string } {
  if (r.sharedFrom) {
    return r.serves >= ENOUGH_MAINS
      ? { label: `Shares ${r.sharedFrom}`, className: "badge b-ok" }
      : { label: `Shares ${r.sharedFrom}, thin`, className: "badge b-stale" };
  }
  if (r.total === 0) return { label: "No menu at all", className: "badge b-stale" };
  if (r.serves < ENOUGH_MAINS) {
    return { label: `Only ${r.serves} ${r.servesLabel}`, className: "badge b-stale" };
  }
  return { label: `${r.serves} ${r.servesLabel} to choose from`, className: "badge b-ok" };
}

export function ThinMenus({ rows }: { rows: Row[] }) {
  const paged = usePagedRows(
    rows,
    (r, needle) =>
      r.name.toLowerCase().includes(needle) ||
      r.area.toLowerCase().includes(needle) ||
      r.type.toLowerCase().includes(needle)
  );

  const needWork = rows.filter((r) => r.serves < ENOUGH_MAINS).length;
  /*
   * Counted apart from the thin ones, because it is a different job. Casa1715
   * holds 223 drinks and not one item of food: the bar list was imported and
   * the kitchen's was not. Nothing is thin about it, and a dinner plan there
   * would serve someone a glass of wine.
   */
  const drinksOnly = rows.filter((r) => r.total > 0 && r.foodItems === 0).length;
  const branches = rows.filter((r) => r.sharedFrom).length;
  const noCuisine = rows.filter((r) => !r.cuisine).length;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchBox
          value={paged.query}
          onChange={paged.setQuery}
          placeholder="Search name or area"
        />
        <span className="text-[13px] text-mutedbrown">
          {needWork} of {rows.length} need more of their menu on file
          {noCuisine ? `, ${noCuisine} have no cuisine recorded` : ""}
          {branches ? `, ${branches} are branches sharing another's` : ""}
          {drinksOnly ? `, ${drinksOnly} hold drinks and no food` : ""}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="tbl w-full border-collapse">
          <thead>
            <tr>
              <th>Venue</th>
              <th className="hidden md:table-cell">Area</th>
              <th>Cuisine</th>
              <th>Mains</th>
              <th className="hidden lg:table-cell">Starters</th>
              <th className="hidden lg:table-cell">Desserts</th>
              <th className="hidden lg:table-cell">Drinks</th>
              <th className="hidden md:table-cell">Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.pageRows.map((r) => {
              const v = verdict(r);
              return (
                <tr key={r.id}>
                  <td className="font-bold">
                    {r.name}
                    <div className="mt-0.5 text-[12px] font-normal text-mutedbrown md:hidden">
                      {r.area} · {r.serves} {r.servesLabel} of {r.total} items
                    </div>
                  </td>
                  <td className="hidden md:table-cell">{r.area}</td>
                  <td className="whitespace-nowrap capitalize">
                    {r.cuisine ?? (
                      <span className="text-staletext">not recorded</span>
                    )}
                  </td>
                  <td
                    className={`font-mono font-bold ${
                      r.mains < ENOUGH_MAINS ? "text-staletext" : ""
                    }`}
                  >
                    {r.mains}
                  </td>
                  <td className="hidden font-mono lg:table-cell">{r.starters}</td>
                  <td className="hidden font-mono lg:table-cell">{r.desserts}</td>
                  <td className="hidden font-mono lg:table-cell">{r.drinks}</td>
                  <td className="hidden font-mono md:table-cell">{r.total}</td>
                  <td>
                    <span className={v.className}>{v.label}</span>
                    {/*
                      Said plainly rather than folded into the badge, because
                      it is a statement about what we hold and not a verdict.
                      A bar legitimately has no food; a restaurant with none
                      means the kitchen's list was never imported.
                    */}
                    {r.total > 0 && r.foodItems === 0 ? (
                      <div className="mt-1 text-[12px] text-staletext">
                        drinks only, no food on file
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">
                    {/*
                      A branch must not be offered "Add dishes". Adding a menu
                      to it is how the sharing gets undone by accident, and the
                      price list to edit is the one it points at.
                    */}
                    {r.sharedFrom ? (
                      <Link
                        href={`/admin/venues/${r.id}`}
                        className="font-semibold text-cocoa hover:text-ink"
                      >
                        Open branch
                      </Link>
                    ) : (
                      <>
                        <Link
                          href={`/admin/venues/${r.id}`}
                          className="font-semibold text-flame hover:text-flame-dark"
                        >
                          Add dishes
                        </Link>
                        <Link
                          href="/admin/import"
                          className="ml-3 font-semibold text-cocoa hover:text-ink"
                        >
                          CSV
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {paged.total === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-mutedbrown">
                  No venue matches “{paged.query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        count={paged.pageRows.length}
        total={paged.total}
        unit="eating venues"
        onGoTo={paged.goTo}
      />
    </>
  );
}
