"use client";

import { useState } from "react";
import { Toast } from "@/components/Toast";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

export interface LoginRow {
  id: string;
  user_id: string;
  username: string;
  venue_id: string;
  venue_name: string;
  area: string;
  created_at: string;
}

/**
 * Venue logins, issued from here.
 *
 * The password appears once, on the screen that made it, and is never stored
 * anywhere it can be read back. That is not an inconvenience to work around:
 * a credential this side can recover is a credential this side can leak, and
 * reissuing takes one click.
 *
 * So the copy button matters more than it looks. It is the only moment the
 * password exists outside the venue's hands.
 */
export function VenueLogins({
  rows,
  venues,
}: {
  rows: LoginRow[];
  venues: { id: string; name: string; area: string }[];
}) {
  const [links, setLinks] = useState(rows);
  const [venueId, setVenueId] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /** The one password currently on screen, and who it belongs to. */
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const paged = usePagedRows(links, (r, needle) =>
    r.username.toLowerCase().includes(needle) || r.venue_name.toLowerCase().includes(needle)
  );

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  async function post(body: unknown) {
    const res = await fetch("/api/admin/venue-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }

  async function create() {
    if (!venueId || !username.trim()) return say("Pick a venue and choose a username.");
    setBusy(true);
    const { res, data } = await post({ action: "create", venueId, username: username.trim() });
    setBusy(false);

    if (!res.ok) return say(data.error ?? "Could not create that login.");

    const venue = venues.find((v) => v.id === venueId)!;
    setLinks((l) => [
      {
        id: crypto.randomUUID(),
        user_id: data.userId,
        username: data.username,
        venue_id: venueId,
        venue_name: venue.name,
        area: venue.area,
        created_at: new Date().toISOString(),
      },
      ...l,
    ]);
    setIssued({ username: data.username, password: data.password });
    setUsername("");
    setVenueId("");
  }

  async function reset(row: LoginRow) {
    if (!confirm(`Issue a new password for ${row.username}? The old one stops working.`)) return;
    setBusy(true);
    const { res, data } = await post({ action: "reset", userId: row.user_id });
    setBusy(false);
    if (!res.ok) return say(data.error ?? "Could not reset that password.");
    setIssued({ username: row.username, password: data.password });
  }

  async function revoke(row: LoginRow) {
    if (!confirm(`Take ${row.username}'s access to ${row.venue_name} away?`)) return;
    setBusy(true);
    const { res, data } = await post({ action: "revoke", linkId: row.id });
    setBusy(false);
    if (!res.ok) return say(data.error ?? "Could not revoke that.");
    setLinks((l) => l.filter((x) => x.id !== row.id));
    say("Revoked");
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => say("Copied"),
      () => say("Could not copy, select it by hand.")
    );
  }

  return (
    <div>
      <div>
        <h1 className="font-display text-[24px] font-bold">Venue logins</h1>
        <div className="text-[14px] text-mutedbrown">
          A username and password for a venue to manage its own listing. They sign in at{" "}
          <code>/venue</code>, not in the app.
        </div>
      </div>

      {/* ── The password, once ── */}
      {issued ? (
        <div className="card mt-5 border-flame p-5">
          <div className="text-[15px] font-bold">
            Send these to {issued.username}. This is the only time the password is shown.
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="flex items-center gap-2">
              <span className="w-[80px] text-[13px] text-mutedbrown">Username</span>
              <code className="flex-1 rounded-md bg-cream px-2.5 py-1.5 font-mono text-[14px]">
                {issued.username}
              </code>
              <button className="btn2 btnsm" onClick={() => copy(issued.username)}>
                Copy
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[80px] text-[13px] text-mutedbrown">Password</span>
              <code className="flex-1 rounded-md bg-cream px-2.5 py-1.5 font-mono text-[14px]">
                {issued.password}
              </code>
              <button className="btn2 btnsm" onClick={() => copy(issued.password)}>
                Copy
              </button>
            </div>
          </div>
          <button
            className="mt-3 text-[13px] font-semibold text-mutedbrown hover:text-flame"
            onClick={() =>
              copy(
                `Your aduro login\n\nGo to https://aduro.app/venue\nUsername: ${issued.username}\nPassword: ${issued.password}`
              )
            }
          >
            Copy the whole message →
          </button>
          <button
            className="ml-4 mt-3 text-[13px] font-semibold text-mutedbrown hover:text-flame"
            onClick={() => setIssued(null)}
          >
            Done, hide it
          </button>
        </div>
      ) : null}

      {/* ── Issue ── */}
      <div className="card mt-5 grid gap-3 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="flex flex-col">
          <span className="flbl">Venue</span>
          <select className="inp" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">Choose one</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.area}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="flbl">Username</span>
          <input
            className="inp"
            value={username}
            placeholder="honeysuckle-osu"
            autoCapitalize="none"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <button className="btn btnsm px-6" onClick={() => void create()} disabled={busy}>
          {busy ? "Working…" : "Issue a login"}
        </button>
      </div>

      <div className="mt-5">
        <SearchBox value={paged.query} onChange={paged.setQuery} placeholder="Search venue or username" />
      </div>

      {paged.pageRows.length === 0 ? (
        <p className="mt-6 rounded-bar border border-line bg-cream/60 p-4 text-[14px] text-mutedbrown">
          No venue logins yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {paged.pageRows.map((row) => (
            <div key={row.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="text-[15px] font-bold">{row.venue_name}</div>
                <div className="text-[13px] text-mutedbrown">
                  <code className="font-mono">{row.username}</code> · {row.area}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn2 btnsm" onClick={() => void reset(row)} disabled={busy}>
                  New password
                </button>
                <button
                  className="rounded-md border border-line px-2.5 py-1 text-[12.5px] font-semibold text-mutedbrown transition-colors hover:border-flame hover:text-flame"
                  onClick={() => void revoke(row)}
                  disabled={busy}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        count={paged.pageRows.length}
        total={paged.total}
        unit="logins"
        onGoTo={paged.goTo}
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}
