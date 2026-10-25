"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_BLURB, ROLE_LABEL, STAFF_ROLES, type StaffRole } from "@/lib/staffRoles";

export interface StaffMember {
  userId: string;
  username: string;
  roles: StaffRole[];
  since: string;
  /** Changes in the last 7 days. */
  week: number;
  last: string | null;
}

type Handover = { username: string; password: string };

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Make, change and remove staff logins; the password is shown once, to hand over. */
export function TeamManager({ members }: { members: StaffMember[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>(["photos"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);

  const toggle = (list: StaffRole[], r: StaffRole) => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);

  async function create() {
    setBusy(true);
    setError(null);
    const { ok, data } = await call({ action: "create", username, roles });
    setBusy(false);
    if (!ok) return setError(data.error ?? "That didn't work.");
    setHandover({ username: data.username, password: data.password });
    setUsername("");
    router.refresh();
  }

  return (
    <div className="mt-6 grid gap-6">
      {handover ? (
        <div className="card border-2 p-5" style={{ borderColor: "#0f766e" }}>
          <div className="text-[15px] font-bold">Hand these over</div>
          <p className="mt-1 text-[13.5px] text-mutedbrown">
            The password is shown once. They sign in at <b>duro-gh.vercel.app/staff/login</b>.
          </p>
          <div className="mt-3 grid gap-1 font-mono text-[15px]">
            <div>Username: {handover.username}</div>
            <div>Password: {handover.password}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn2 btnsm"
              onClick={() =>
                navigator.clipboard?.writeText(
                  `Duro! staff login\nSign in at https://duro-gh.vercel.app/staff/login\nUsername: ${handover.username}\nPassword: ${handover.password}`
                )
              }
            >
              Copy as a message
            </button>
            <button type="button" className="btn2 btnsm" onClick={() => setHandover(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      <section className="card p-5">
        <div className="text-[15px] font-bold">New login</div>
        <div className="mt-3 grid gap-3 md:grid-cols-[260px_1fr]">
          <div>
            <label className="flbl">Username</label>
            <input
              className="inp"
              placeholder="e.g. ama.photos"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
          </div>
          <div>
            <div className="flbl">What they may do</div>
            <div className="flex flex-wrap gap-2">
              {STAFF_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={roles.includes(r) ? "btn btnsm" : "btn2 btnsm"}
                  onClick={() => setRoles(toggle(roles, r))}
                  title={ROLE_BLURB[r]}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12.5px] text-mutedbrown">{roles.map((r) => ROLE_BLURB[r]).join(" ")}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" className="btn" onClick={create} disabled={busy || username.length < 3 || !roles.length}>
            {busy ? "Making it…" : "Make the login"}
          </button>
          {error ? <span className="text-[14px] text-staletext">{error}</span> : null}
        </div>
      </section>

      <section>
        <h2 className="adm-section-title">People</h2>
        {members.length === 0 ? (
          <div className="why mt-3">No staff logins yet.</div>
        ) : (
          <div className="mt-3 grid gap-3">
            {members.map((m) => (
              <Member key={m.userId} m={m} onHandover={setHandover} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Member({ m, onHandover }: { m: StaffMember; onHandover: (h: Handover) => void }) {
  const router = useRouter();
  const [roles, setRoles] = useState<StaffRole[]>(m.roles);
  const [busy, setBusy] = useState(false);
  const changed = [...roles].sort().join() !== [...m.roles].sort().join();

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const { ok, data } = await call({ ...body, userId: m.userId });
    setBusy(false);
    if (ok && data.password) onHandover({ username: data.username, password: data.password });
    if (ok) router.refresh();
  }

  return (
    <div className="card flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-[180px] flex-1">
        <div className="font-semibold">{m.username}</div>
        <div className="text-[12.5px] text-mutedbrown">
          {m.week} change{m.week === 1 ? "" : "s"} this week
          {m.last ? ` · last ${new Date(m.last).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STAFF_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={roles.includes(r) ? "btn btnsm" : "btn2 btnsm"}
            onClick={() => setRoles((l) => (l.includes(r) ? l.filter((x) => x !== r) : [...l, r]))}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {changed ? (
          <button type="button" className="btn btnsm" disabled={busy || !roles.length} onClick={() => act({ action: "roles", roles })}>
            Save roles
          </button>
        ) : null}
        <Link href={`/admin/team/activity?user=${m.userId}`} className="btn2 btnsm">
          Their changes
        </Link>
        <button type="button" className="btn2 btnsm" disabled={busy} onClick={() => act({ action: "reset" })}>
          New password
        </button>
        <button
          type="button"
          className="btn2 btnsm !text-staletext"
          disabled={busy}
          onClick={() => window.confirm(`Remove ${m.username}? They can no longer sign in. Their changes stay in the log.`) && act({ action: "remove" })}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
