"use client";

import { useState } from "react";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Row {
  id: string;
  name: string;
  type: string;
  area: string;
}

/** A sensible default label per venue type, what one person is actually buying. */
const DEFAULT_LABEL: Record<string, string> = {
  activity: "Entry, per person",
  outdoor: "Entry, per person",
  lounge: "Typical spend, per person",
  cafe: "Typical spend, per person",
  dessert: "Typical spend, per person",
  restaurant: "Typical spend, per person",
};

interface Draft {
  from: string;
  to: string;
  label: string;
}

/**
 * Pricing for venues with no menu, bowling, padel, sip and paint.
 *
 * These have no dishes to itemise, but the planner still needs a number: a
 * venue with no price is treated as unpriced and withheld from planning
 * entirely, which is why most of the activity catalog never appears.
 *
 * A range is accepted, and the UPPER bound becomes the price used. The app's
 * promise is that a plan stays inside the stated budget, so budgeting from the
 * bottom of a range would break that on exactly the days someone pays the top
 * of it. The full range is kept in the note so the user sees it.
 */
export function UnpricedVenues({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  /*
   * Drafts are keyed by venue id, so a half-typed price survives paging away
   * and back. Only saving clears it, which is the same rule the bulk price
   * editor follows.
   */
  const paged = usePagedRows(
    rows,
    (r, needle) =>
      r.name.toLowerCase().includes(needle) ||
      r.area.toLowerCase().includes(needle) ||
      r.type.toLowerCase().includes(needle)
  );

  function draftFor(row: Row): Draft {
    return (
      drafts[row.id] ?? {
        from: "",
        to: "",
        label: DEFAULT_LABEL[row.type] ?? "Typical spend, per person",
      }
    );
  }

  function setDraft(id: string, patch: Partial<Draft>, row: Row) {
    setDrafts((d) => ({ ...d, [id]: { ...draftFor(row), ...patch } }));
  }

  async function save(row: Row) {
    const d = draftFor(row);
    const from = Number(d.from);
    const to = d.to ? Number(d.to) : null;

    if (!Number.isFinite(from) || from <= 0) {
      setError(`Enter a price for ${row.name}.`);
      return;
    }
    if (to !== null && (!Number.isFinite(to) || to < from)) {
      setError(`For ${row.name}, the top of the range must be at least the bottom.`);
      return;
    }

    // Budget from the top of the range, so a plan cannot quietly bust.
    const price = to ?? from;
    const notes = to !== null ? `Ranges GHS ${from}–${to} per person` : null;

    setBusyId(row.id);
    setError(null);
    try {
      const { error: itemError } = await supabase.from("menu_items").insert({
        venue_id: row.id,
        name: d.label.trim() || "Entry, per person",
        category: "other",
        price_ghs: price,
        notes,
      });
      if (itemError) throw itemError;

      // Also set the average, which is what the budget pre-filter reads before
      // any menu is consulted.
      const { error: venueError } = await supabase
        .from("venues")
        .update({ avg_cost_per_person_ghs: price })
        .eq("id", row.id);
      if (venueError) throw venueError;

      setSaved((s) => ({ ...s, [row.id]: `GHS ${price}` }));
      router.refresh();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Could not save.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6">
      {error && <div className="why mb-4 not-italic text-staletext">{error}</div>}

      <div className="card px-5 py-5">
        <div className="text-[15px] font-bold">{rows.length} venues with no price</div>
        <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
          These never appear in a plan. A venue with no menu and no average cost is
          unpriced, not free, left in, it would be the cheapest option in every
          search and land in itineraries at GHS 0. Give each one what a single
          person pays and it re-enters planning immediately.
        </p>

        {rows.length > ADMIN_PAGE_SIZE ? (
          <div className="mt-4">
            <SearchBox
              value={paged.query}
              onChange={paged.setQuery}
              placeholder="Search name, area or type"
            />
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="tbl w-full border-collapse">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Area</th>
                <th>What one person pays</th>
                <th>Called</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((row) => {
                const d = draftFor(row);
                const done = saved[row.id];
                return (
                  <tr key={row.id}>
                    <td className="font-bold">
                      {row.name}
                      <div className="text-[13px] font-normal capitalize text-mutedbrown">
                        {row.type}
                      </div>
                    </td>
                    <td>{row.area}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input
                          className="inp h-[38px] w-[92px] font-mono"
                          type="number"
                          placeholder="from"
                          value={d.from}
                          onChange={(e) => setDraft(row.id, { from: e.target.value }, row)}
                        />
                        <span className="text-mutedbrown">–</span>
                        <input
                          className="inp h-[38px] w-[92px] font-mono"
                          type="number"
                          placeholder="to"
                          value={d.to}
                          onChange={(e) => setDraft(row.id, { to: e.target.value }, row)}
                        />
                      </div>
                      <div className="mt-1 text-[12px] text-mutedbrown">
                        Leave “to” blank for a single price. We budget from the top.
                      </div>
                    </td>
                    <td>
                      <input
                        className="inp h-[38px] min-w-[190px]"
                        value={d.label}
                        onChange={(e) => setDraft(row.id, { label: e.target.value }, row)}
                      />
                    </td>
                    <td className="whitespace-nowrap">
                      {done ? (
                        <span className="badge b-ok">Priced · {done}</span>
                      ) : (
                        <button
                          className="font-semibold text-flame disabled:opacity-40"
                          disabled={busyId !== null}
                          onClick={() => save(row)}
                        >
                          {busyId === row.id ? "Saving…" : "Save"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paged.total === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-mutedbrown">
                    {paged.query
                      ? `No unpriced venue matches “${paged.query}”.`
                      : "Every active venue has a price. Nothing is being withheld."}
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
          unit="unpriced venues"
          onGoTo={paged.goTo}
        />
      </div>
    </div>
  );
}
