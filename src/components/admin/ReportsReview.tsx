"use client";

import { useState } from "react";
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
  created_at: string;
  current_price: number | null;
  pricing_mode: string;
  is_active: boolean;
}

const TYPE_LABEL: Record<string, string> = {
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
    action: "dismiss" | "reviewed" | "apply_price" | "deactivate",
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

  if (!groups.length) {
    return (
      <p className="mt-6 text-[14px] text-mutedbrown">
        Nothing reported. This fills up on its own once people are out using plans.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((g) => {
        /* The clearest suggested price is the one most people agree on. */
        const prices = g.reports
          .map((r) => r.suggested_price_ghs)
          .filter((p): p is number => p != null);
        const suggested = prices.length
          ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]
          : null;

        const closedCount = g.reports.filter((r) => r.report_type === "closed").length;

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

      {toast && <Toast message={toast} />}
    </div>
  );
}
