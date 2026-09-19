"use client";

import { useState } from "react";
import { Toast } from "@/components/Toast";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

export interface PlannerRow {
  user_id: string;
  username: string;
  display_name: string;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  /** How many locations they have made. The whole point of the account. */
  locations: number;
}

/**
 * Accounts for the people who plan events but have nowhere to hold them.
 *
 * ── this issues more than a login ───────────────────────────────────────
 * A venue login lets a restaurant edit the row we already wrote about it. A
 * planner login lets somebody add rows: locations that go straight into the
 * catalogue and straight into people's evenings, with nothing between them
 * and a user. There is no review queue behind this button, deliberately --
 * an approval step nobody empties is worse than none, because it reads as a
 * promise of review that is not being kept.
 *
 * So the verification is the conversation you have before clicking Issue.
 * That is the entire control, and it is why this is not a sign-up form.
 *
 * ── suspend, not delete ─────────────────────────────────────────────────
 * Turning an account off stops it creating anything new and leaves every
 * location and event it already made exactly where they are. Deleting the
 * account would orphan them. Use the venues and events screens to take down
 * anything specific.
 */
export function PlannerLogins({ rows }: { rows: PlannerRow[] }) {
  const [planners, setPlanners] = useState(rows);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /** The one password currently on screen, and who it belongs to. */
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const paged = usePagedRows(
    planners,
    (r, needle) =>
      r.username.toLowerCase().includes(needle) || r.display_name.toLowerCase().includes(needle)
  );

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  async function post(body: unknown) {
    const res = await fetch("/api/admin/planner-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }

  async function create() {
    if (!username.trim() || !displayName.trim()) {
      return say("A planner needs a username and a name to appear under.");
    }
    setBusy(true);
    const { res, data } = await post({
      action: "create",
      username: username.trim(),
      displayName: displayName.trim(),
      contactPhone: phone.trim() || undefined,
    });
    setBusy(false);

    if (!res.ok) return say(data.error ?? "Could not create that login.");

    setPlanners((p) => [
      {
        user_id: data.userId,
        username: data.username,
        display_name: displayName.trim(),
        contact_phone: phone.trim() || null,
        is_active: true,
        created_at: new Date().toISOString(),
        locations: 0,
      },
      ...p,
    ]);
    setIssued({ username: data.username, password: data.password });
    setUsername("");
    setDisplayName("");
    setPhone("");
  }

  async function reset(row: PlannerRow) {
    if (!confirm(`Issue a new password for ${row.username}? The old one stops working.`)) return;
    setBusy(true);
    const { res, data } = await post({ action: "reset", userId: row.user_id });
    setBusy(false);
    if (!res.ok) return say(data.error ?? "Could not reset that password.");
    setIssued({ username: row.username, password: data.password });
  }

  async function suspend(row: PlannerRow) {
    const turningOff = row.is_active;
    if (
      turningOff &&
      !confirm(
        `Stop ${row.display_name} creating new locations? Everything they have already made stays up.`
      )
    ) {
      return;
    }
    setBusy(true);
    const { res, data } = await post({
      action: "suspend",
      userId: row.user_id,
      active: !row.is_active,
    });
    setBusy(false);
    if (!res.ok) return say(data.error ?? "Could not change that.");
    setPlanners((p) =>
      p.map((x) => (x.user_id === row.user_id ? { ...x, is_active: !row.is_active } : x))
    );
    say(turningOff ? "Suspended" : "Back on");
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
        <h1 className="font-display text-[24px] font-bold">Event planners</h1>
        <div className="text-[14px] text-mutedbrown">
          For people who run events but have no fixed address. They add their own location and put
          events at it, and both go live immediately — nothing here reviews them afterwards, so
          only issue one to somebody you have actually checked.
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
                // The origin this page is served from, never a domain written
                // down here: a hardcoded one is correct until the day it is
                // not, and then it sends people to a site that does not exist.
                `Your aduro planner login\n\nGo to ${window.location.origin}/venue\nUsername: ${issued.username}\nPassword: ${issued.password}\n\nAdd your location first, then put your event at it.`
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
      <div className="card mt-5 grid gap-3 p-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <label className="flex flex-col">
          <span className="flbl">Name on the poster</span>
          <input
            className="inp"
            value={displayName}
            placeholder="Accra Night Market"
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="flbl">Username</span>
          <input
            className="inp"
            value={username}
            placeholder="accra-night-market"
            autoCapitalize="none"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className="flbl">Their number</span>
          <input
            className="inp font-mono"
            value={phone}
            inputMode="tel"
            placeholder="+233 ..."
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <button className="btn btnsm px-6" onClick={() => void create()} disabled={busy}>
          {busy ? "Working…" : "Issue a login"}
        </button>
      </div>

      {/* ── Who has one ── */}
      <div className="card mt-5 p-5">
        <SearchBox value={paged.query} onChange={paged.setQuery} placeholder="Search planners" />
        {planners.length ? (
          <table className="tbl mt-3 w-full">
            <thead>
              <tr>
                <th>Planner</th>
                <th>Username</th>
                <th>Number</th>
                <th className="text-right">Locations</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((r) => (
                <tr key={r.user_id} className={r.is_active ? "" : "opacity-50"}>
                  <td className="font-semibold">
                    {r.display_name}
                    {r.is_active ? null : (
                      <span className="ml-2 rounded-full bg-staletext px-1.5 text-[11px] text-white">
                        off
                      </span>
                    )}
                  </td>
                  <td className="font-mono text-[13px]">{r.username}</td>
                  <td className="font-mono text-[13px]">{r.contact_phone ?? "—"}</td>
                  <td className="text-right tabular-nums">{r.locations}</td>
                  <td className="text-right">
                    <button className="btn2 btnsm" onClick={() => void reset(r)} disabled={busy}>
                      New password
                    </button>
                    <button
                      className="btn2 btnsm ml-2"
                      onClick={() => void suspend(r)}
                      disabled={busy}
                    >
                      {r.is_active ? "Suspend" : "Turn back on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mt-3 text-[14px] text-mutedbrown">
            Nobody yet. The first one should be somebody whose events you would put your own name
            to.
          </div>
        )}
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          start={paged.start}
          count={paged.pageRows.length}
          total={paged.total}
          unit="planners"
          onGoTo={paged.goTo}
        />
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
