"use client";

import { useState } from "react";
import { Toast } from "@/components/Toast";

export interface Application {
  id: string;
  created_at: string;
  business_name: string;
  kind: "cake" | "flowers";
  contact_name: string | null;
  phone: string;
  whatsapp_phone: string | null;
  instagram_handle: string | null;
  area: string | null;
  note: string | null;
  status: "new" | "approved" | "declined";
}

export interface VendorListRow {
  id: string;
  name: string;
  kind: "cake" | "flowers";
  is_active: boolean;
  username: string | null;
  userId: string | null;
  products: number;
}

/** A username to start from: the shop's name, lowercased and dashed. */
function suggest(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Cake and flower vendors: applications from /vendor/apply, and logins.
 *
 * Approving creates the vendor and its login together. Check the shop first
 * (their Instagram, a call): once approved they add products themselves and
 * those reach people's plans without anybody looking at them again.
 */
export function VendorAdmin({ applications, vendors }: { applications: Application[]; vendors: VendorListRow[] }) {
  const [apps, setApps] = useState(applications);
  const [list, setList] = useState(vendors);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [showDecided, setShowDecided] = useState(false);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  async function post(body: unknown) {
    setBusy(true);
    const res = await fetch("/api/admin/vendor-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    return { res, data };
  }

  async function approve(a: Application) {
    const username = (names[a.id] ?? suggest(a.business_name)).trim();
    if (!confirm(`Approve ${a.business_name} and issue the login "${username}"?`)) return;
    const { res, data } = await post({ action: "approve", applicationId: a.id, username });
    if (!res.ok) return say(data.error ?? "Could not approve that.");
    setApps((x) => x.map((r) => (r.id === a.id ? { ...r, status: "approved" } : r)));
    setList((x) => [{ id: data.vendorId, name: a.business_name, kind: a.kind, is_active: true, username: data.username, userId: data.userId, products: 0 }, ...x]);
    setIssued({ username: data.username, password: data.password });
  }

  async function decline(a: Application) {
    if (!confirm(`Decline ${a.business_name}? Nothing is sent to them; let them know yourself.`)) return;
    const { res, data } = await post({ action: "decline", applicationId: a.id });
    if (!res.ok) return say(data.error ?? "Could not decline that.");
    setApps((x) => x.map((r) => (r.id === a.id ? { ...r, status: "declined" } : r)));
  }

  async function issue(v: VendorListRow) {
    const username = (names[v.id] ?? suggest(v.name)).trim();
    const { res, data } = await post({ action: "issue", vendorId: v.id, username });
    if (!res.ok) return say(data.error ?? "Could not issue that login.");
    setList((x) => x.map((r) => (r.id === v.id ? { ...r, username: data.username, userId: data.userId } : r)));
    setIssued({ username: data.username, password: data.password });
  }

  async function reset(v: VendorListRow) {
    if (!v.userId || !confirm(`New password for ${v.username}? The old one stops working.`)) return;
    const { res, data } = await post({ action: "reset", userId: v.userId });
    if (!res.ok) return say(data.error ?? "Could not reset that.");
    setIssued({ username: v.username!, password: data.password });
  }

  async function revoke(v: VendorListRow) {
    if (!v.userId || !confirm(`Delete ${v.username}'s login? ${v.name} and its products stay, run by admins.`)) return;
    const { res, data } = await post({ action: "revoke", userId: v.userId });
    if (!res.ok) return say(data.error ?? "Could not delete that login.");
    setList((x) => x.map((r) => (r.id === v.id ? { ...r, username: null, userId: null } : r)));
    say("Login deleted");
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => say("Copied"),
      () => say("Could not copy, select it by hand.")
    );
  }

  const open = apps.filter((a) => a.status === "new");
  const decided = apps.filter((a) => a.status !== "new");

  const nameBox = (id: string, fallback: string) => (
    <input
      className="inp h-[36px] w-[180px] font-mono text-[13px]"
      autoCapitalize="none"
      value={names[id] ?? suggest(fallback)}
      onChange={(e) => setNames((n) => ({ ...n, [id]: e.target.value }))}
    />
  );

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Cake and flower vendors</h1>
      <div className="text-[14px] text-mutedbrown">
        Shops apply at /vendor/apply. Approving one lists it and gives it a login to add its own products and prices at /vendor.
        Check them first: what they add goes straight into people&apos;s plans.
      </div>

      {issued ? (
        <div className="card mt-5 border-flame p-5">
          <div className="text-[15px] font-bold">Send these to {issued.username}. This is the only time the password is shown.</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {(["username", "password"] as const).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-[80px] text-[13px] capitalize text-mutedbrown">{k}</span>
                <code className="flex-1 rounded-md bg-cream px-2.5 py-1.5 font-mono text-[14px]">{issued[k]}</code>
                <button className="btn2 btnsm" onClick={() => copy(issued[k])}>
                  Copy
                </button>
              </div>
            ))}
          </div>
          <button
            className="mt-3 text-[13px] font-semibold text-mutedbrown hover:text-flame"
            onClick={() =>
              copy(
                `You're on Duro!\n\nAdd your products and prices at ${window.location.origin}/vendor/login\nUsername: ${issued.username}\nPassword: ${issued.password}\n\nOnce you add a product with a price, people planning birthdays and dates can add it to their plan.`
              )
            }
          >
            Copy the whole message →
          </button>
          <button className="ml-4 mt-3 text-[13px] font-semibold text-mutedbrown hover:text-flame" onClick={() => setIssued(null)}>
            Done, hide it
          </button>
        </div>
      ) : null}

      {/* ── Applications ── */}
      <div className="card mt-5 p-5">
        <div className="text-[16px] font-bold">Applications{open.length ? ` (${open.length} waiting)` : ""}</div>
        {!open.length ? <div className="mt-2 text-[14px] text-mutedbrown">None waiting.</div> : null}
        <div className="mt-3 grid gap-3">
          {open.map((a) => (
            <div key={a.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[16px] font-bold">
                  {a.kind === "cake" ? "🎂" : "💐"} {a.business_name}
                </div>
                <div className="text-[12.5px] text-mutedbrown">{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
              </div>
              <div className="mt-1 grid gap-0.5 text-[14px]">
                {a.contact_name ? <div>{a.contact_name}</div> : null}
                <div className="font-mono">
                  {a.phone}
                  {a.whatsapp_phone ? ` · WhatsApp ${a.whatsapp_phone}` : ""}
                </div>
                {a.instagram_handle ? (
                  <a className="font-semibold text-flame underline" href={`https://instagram.com/${a.instagram_handle}`} target="_blank" rel="noreferrer">
                    @{a.instagram_handle}
                  </a>
                ) : null}
                {a.area ? <div className="text-mutedbrown">{a.area}</div> : null}
                {a.note ? <div className="mt-1 whitespace-pre-wrap">{a.note}</div> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-mutedbrown">Username</span>
                {nameBox(a.id, a.business_name)}
                <button className="btn btnsm" disabled={busy} onClick={() => void approve(a)}>
                  Approve
                </button>
                <button className="btn2 btnsm" disabled={busy} onClick={() => void decline(a)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
        {decided.length ? (
          <button className="mt-3 text-[13px] font-semibold text-mutedbrown hover:text-flame" onClick={() => setShowDecided((s) => !s)}>
            {showDecided ? "Hide" : "Show"} {decided.length} decided
          </button>
        ) : null}
        {showDecided ? (
          <div className="mt-2 grid gap-1 text-[13.5px]">
            {decided.map((a) => (
              <div key={a.id}>
                {a.business_name} · {a.phone} · <span className={a.status === "approved" ? "text-[#0f766e]" : "text-mutedbrown"}>{a.status}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Vendors and their logins ── */}
      <div className="card mt-5 p-5">
        <div className="text-[16px] font-bold">Vendors</div>
        <table className="tbl mt-3 w-full">
          <thead>
            <tr>
              <th>Vendor</th>
              <th className="text-right">Products</th>
              <th>Login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className={v.is_active ? "" : "opacity-50"}>
                <td className="font-semibold">
                  {v.kind === "cake" ? "🎂" : "💐"} {v.name}
                </td>
                <td className="text-right tabular-nums">{v.products}</td>
                <td className="font-mono text-[13px]">{v.username ?? nameBox(v.id, v.name)}</td>
                <td className="whitespace-nowrap text-right">
                  {v.userId ? (
                    <>
                      <button className="btn2 btnsm" disabled={busy} onClick={() => void reset(v)}>
                        New password
                      </button>
                      <button className="ml-2 text-[13px] font-semibold text-mutedbrown hover:text-flame" disabled={busy} onClick={() => void revoke(v)}>
                        Delete login
                      </button>
                    </>
                  ) : (
                    <button className="btn btnsm" disabled={busy} onClick={() => void issue(v)}>
                      Issue a login
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}
