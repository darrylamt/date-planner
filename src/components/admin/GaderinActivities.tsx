"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

export interface GaderinRow {
  slug: string;
  url: string;
  title: string;
  host: string | null;
  location: string | null;
  category: string | null;
  price: number | null;
  when: string;
  image: string | null;
  venueId: string | null;
  venueName: string | null;
  dismissed: boolean;
}

export interface VenueChoice {
  id: string;
  label: string;
}

type Tab = "waiting" | "linked" | "dismissed";

/**
 * Gaderin's activities, placed at Duro venues by hand where the scraper could
 * not tell. A linked activity becomes dated events at the next daily run;
 * one Duro cannot use (another town, a place we do not list) is set aside so
 * the queue holds only what is worth an admin's minute.
 */
export function GaderinActivities({ rows, venues }: { rows: GaderinRow[]; venues: VenueChoice[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("waiting");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byLabel = useMemo(() => new Map(venues.map((v) => [v.label.toLowerCase(), v.id])), [venues]);
  const inTab = rows.filter((r) =>
    tab === "dismissed" ? r.dismissed : tab === "linked" ? !r.dismissed && r.venueId : !r.dismissed && !r.venueId
  );
  const paged = usePagedRows(inTab, (r, n) =>
    [r.title, r.host, r.location, r.category, r.venueName].some((s) => (s ?? "").toLowerCase().includes(n))
  );
  const counts = {
    waiting: rows.filter((r) => !r.dismissed && !r.venueId).length,
    linked: rows.filter((r) => !r.dismissed && r.venueId).length,
    dismissed: rows.filter((r) => r.dismissed).length,
  };

  async function act(body: Record<string, unknown>, slug: string) {
    setBusy(slug);
    setError(null);
    const res = await fetch("/api/admin/gaderin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not save.");
      return;
    }
    router.refresh();
  }

  function link(row: GaderinRow) {
    const id = byLabel.get((picked[row.slug] ?? "").toLowerCase());
    if (!id) {
      setError("Pick a venue from the list first.");
      return;
    }
    void act({ action: "link", slug: row.slug, venueId: id }, row.slug);
  }

  return (
    <div className="mt-6">
      {error && <div className="why mb-4 not-italic text-staletext">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["waiting", "Needs a venue"],
            ["linked", "Linked"],
            ["dismissed", "Not for Duro"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 ${
              tab === id ? "bg-flame text-blush ring-flame" : "ring-black/10 hover:ring-flame"
            }`}
          >
            {label} <span className="opacity-70">{counts[id]}</span>
          </button>
        ))}
      </div>

      <div className="card mt-4 px-5 py-5">
        <SearchBox value={paged.query} onChange={paged.setQuery} placeholder="Search title, host, place or category" />

        {/* One list of venues for every row's picker: typing filters it, and only a real name links. */}
        <datalist id="duro-venues">
          {venues.map((v) => (
            <option key={v.id} value={v.label} />
          ))}
        </datalist>

        <div className="mt-4 overflow-x-auto">
          <table className="tbl w-full border-collapse">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Where Gaderin says</th>
                <th>When</th>
                <th>{tab === "linked" ? "Venue" : "Place it at"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((r) => (
                <tr key={r.slug}>
                  <td className="min-w-[260px]">
                    <div className="flex gap-3">
                      {r.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                      ) : null}
                      <div>
                        <a href={r.url} target="_blank" rel="noreferrer" className="font-bold hover:underline">
                          {r.title}
                        </a>
                        <div className="text-[13px] text-mutedbrown">
                          {[r.category, r.price != null ? `GHS ${r.price}` : null, r.host ? `by ${r.host}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-[14px]">{r.location ?? "—"}</td>
                  <td className="text-[13px] text-mutedbrown">{r.when}</td>
                  <td className="min-w-[220px]">
                    {tab === "linked" ? (
                      <span className="text-[14px] font-semibold">{r.venueName}</span>
                    ) : tab === "waiting" ? (
                      <div>
                        <input
                          list="duro-venues"
                          className="inp h-10 w-full text-[14px]"
                          placeholder="Type a venue name"
                          value={picked[r.slug] ?? ""}
                          onChange={(e) => setPicked((p) => ({ ...p, [r.slug]: e.target.value }))}
                        />
                        <a
                          href={`/admin/venues/new?name=${encodeURIComponent(r.location ?? r.host ?? "")}`}
                          className="mt-1 block text-[12px] font-semibold text-flame underline"
                        >
                          Not listed? Add it as a venue
                        </a>
                      </div>
                    ) : (
                      <span className="text-[13px] text-mutedbrown">Set aside</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {tab === "waiting" ? (
                      <>
                        <button
                          type="button"
                          className="btn btnsm px-4"
                          disabled={busy === r.slug}
                          onClick={() => link(r)}
                        >
                          Link
                        </button>
                        <button
                          type="button"
                          className="ml-2 text-[13px] font-semibold text-mutedbrown underline"
                          disabled={busy === r.slug}
                          onClick={() => void act({ action: "dismiss", slug: r.slug, dismissed: true }, r.slug)}
                        >
                          Not for Duro
                        </button>
                      </>
                    ) : tab === "linked" ? (
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-mutedbrown underline"
                        disabled={busy === r.slug}
                        onClick={() => void act({ action: "unlink", slug: r.slug }, r.slug)}
                      >
                        Unlink
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-flame underline"
                        disabled={busy === r.slug}
                        onClick={() => void act({ action: "dismiss", slug: r.slug, dismissed: false }, r.slug)}
                      >
                        Bring back
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          start={paged.start}
          count={paged.pageRows.length}
          total={paged.total}
          unit="activities"
          onGoTo={paged.goTo}
        />
      </div>
    </div>
  );
}
