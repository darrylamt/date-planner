"use client";

import { useState } from "react";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Toast } from "@/components/Toast";

/**
 * What people out in the city are telling us.
 *
 * Grouped by venue rather than listed by time, because three people saying a
 * place has shut is one fact, not three rows, and the count is the part worth
 * acting on. The most-reported venue sits at the top for the same reason.
 *
 * Every action here is a person's decision. A report never edits the catalog
 * on its own: a price anyone could change from a phone is a price anyone could
 * change to anything.
 */
export interface ReportRow {
  id: string;
  venue_id: string;
  venue_name: string;
  area: string;
  report_type: string;
  note: string | null;
  suggested_price_ghs: number | null;
  rating: number | null;
  current_aesthetics: number | null;
  created_at: string;
  current_price: number | null;
  pricing_mode: string;
  is_active: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  aesthetics: "Rated how it looks",
  price: "Price is different",
  closed: "Closed or not there",
  phone: "Number is wrong",
  wrong_info: "Something else is wrong",
  other: "Other",
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface Group {
  venue_id: string;
  venue_name: string;
  area: string;
  is_active: boolean;
  current_price: number | null;
  current_aesthetics: number | null;
  pricing_mode: string;
  reports: ReportRow[];
}

export function ReportsReview({ rows }: { rows: ReportRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const groups: Group[] = [];
  const byVenue = new Map<string, Group>();
  for (const r of rows) {
    let g = byVenue.get(r.venue_id);
    if (!g) {
      g = {
        venue_id: r.venue_id,
        venue_name: r.venue_name,
        area: r.area,
        is_active: r.is_active,
        current_price: r.current_price,
        current_aesthetics: r.current_aesthetics,
        pricing_mode: r.pricing_mode,
        reports: [],
      };
      byVenue.set(r.venue_id, g);
      groups.push(g);
    }
    g.reports.push(r);
  }
  groups.sort((a, b) => b.reports.length - a.reports.length);

  async function act(
    venueId: string,
    action: "dismiss" | "reviewed" | "apply_price" | "apply_rating" | "deactivate",
    value?: number
  ) {
    setBusy(venueId + action);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, action, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That did not work.");
      setToast(json.message ?? "Done");
      router.refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /*
   * Ten venues at a time, sorted by how many people reported them, so the
   * loudest problems are on page one. Called before the early return because a
   * hook cannot be skipped on some renders and not others.
   */
  const paged = usePagedRows(groups, (g, needle) =>
    g.venue_name.toLowerCase().includes(needle)
  );

  if (!groups.length) {
    return (
      <p className="mt-6 text-[14px] text-mutedbrown">
        Nothing reported. This fills up on its own once people are out using plans.
      </p>
    );
  }

  return (
    <div className="mt-6">
      {groups.length > ADMIN_PAGE_SIZE ? (
        <div className="mb-4">
          <SearchBox
            value={paged.query}
            onChange={paged.setQuery}
            placeholder="Search reported venues"
          />
        </div>
      ) : null}

      <div className="space-y-4">
      {paged.pageRows.map((g) => {
        /* The clearest suggested price is the one most people agree on. */
        const prices = g.reports
          .map((r) => r.suggested_price_ghs)
          .filter((p): p is number => p != null);
        const suggested = prices.length
          ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]
          : null;

        const closedCount = g.reports.filter((r) => r.report_type === "closed").length;

        const ratings = g.reports
          .map((r) => r.rating)
          .filter((r): r is number => r != null);
        const averageRating = ratings.length
          ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
          : null;

        return (
          <div key={g.venue_id} className="card px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Link
                  href={`/admin/venues/${g.venue_id}`}
                  className="text-[16px] font-bold underline decoration-line underline-offset-2"
                >
                  {g.venue_name}
                </Link>
                <span className="ml-2 text-[13px] text-mutedbrown">{g.area}</span>
                {!g.is_active ? (
                  <span className="badge b-stale ml-2">inactive</span>
                ) : null}
              </div>
              <span className="text-[13px] text-mutedbrown">
                {g.reports.length} report{g.reports.length === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="mt-3 space-y-2">
              {g.reports.map((r) => (
                <li key={r.id} className="text-[13.5px]">
                  <span className="font-semibold">{TYPE_LABEL[r.report_type] ?? r.report_type}</span>
                  <span className="ml-2 text-mutedbrown">{ago(r.created_at)}</span>
                  {r.suggested_price_ghs != null ? (
                    <span className="ml-2">said GHS {r.suggested_price_ghs}</span>
                  ) : null}
                  {r.rating != null ? (
                    <span className="ml-2 text-flame">{"★".repeat(r.rating)}</span>
                  ) : null}
                  {r.note ? (
                    <div className="mt-0.5 text-mutedbrown">{r.note}</div>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {suggested != null && g.pricing_mode === "per_person" ? (
                <button
                  className="btn btnsm"
                  disabled={busy === g.venue_id + "apply_price"}
                  onClick={() => act(g.venue_id, "apply_price", suggested)}
                >
                  Set price to GHS {suggested}
                  {g.current_price != null ? ` (was ${g.current_price})` : ""}
                </button>
              ) : null}

              {suggested != null && g.pricing_mode !== "per_person" ? (
                <span className="text-[13px] text-mutedbrown">
                  Charged {g.pricing_mode.replace(/_/g, " ")}, so set the rate on the venue
                  rather than from here.
                </span>
              ) : null}

              {averageRating != null && averageRating !== g.current_aesthetics ? (
                <button
                  className="btn btnsm"
                  disabled={busy === g.venue_id + "apply_rating"}
                  onClick={() => act(g.venue_id, "apply_rating", averageRating)}
                >
                  Set looks to {"★".repeat(averageRating)}
                  {g.current_aesthetics != null
                    ? ` (was ${"★".repeat(g.current_aesthetics)})`
                    : ""}
                </button>
              ) : null}

              {closedCount > 0 && g.is_active ? (
                <button
                  className="btn2 btnsm"
                  disabled={busy === g.venue_id + "deactivate"}
                  onClick={() => act(g.venue_id, "deactivate")}
                >
                  Deactivate venue
                </button>
              ) : null}

              <button
                className="btn2 btnsm"
                disabled={busy === g.venue_id + "reviewed"}
                onClick={() => act(g.venue_id, "reviewed")}
              >
                Mark reviewed
              </button>
              <button
                className="btn2 btnsm"
                disabled={busy === g.venue_id + "dismiss"}
                onClick={() => act(g.venue_id, "dismiss")}
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
      </div>

      {paged.total === 0 ? (
        <p className="text-[14px] text-mutedbrown">
          No reported venue matches “{paged.query}”.
        </p>
      ) : null}

      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        count={paged.pageRows.length}
        total={paged.total}
        unit="reported venues"
        onGoTo={paged.goTo}
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}
