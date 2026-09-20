"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface IssueRow {
  id: string;
  area: string;
  message: string;
  context: Record<string, unknown> | null;
  reporter_email: string | null;
  reporter_device: string | null;
  created_at: string;
}

/**
 * Problem reports, oldest first.
 *
 * Oldest first on purpose, and against the habit of every other queue here.
 * Those are catalogue work, where the freshest report is the truest. This is
 * somebody waiting to hear whether the thing they hit is being fixed, and a
 * newest-first queue is how the report that has been open longest becomes the
 * one nobody ever reaches.
 *
 * Nothing on this page edits anything but the report's own status. The fix
 * lives in a commit.
 */
const AREA_LABEL: Record<string, string> = {
  chat: "Assistant",
  plan: "Planning",
  account: "Signing in",
  payment: "Paying",
  other: "Other",
};

export function IssuesReview({ rows }: { rows: IssueRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function act(id: string, action: "actioned" | "dismissed") {
    setBusy(id + action);
    try {
      const res = await fetch("/api/admin/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, resolution: notes[id] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That did not save.");
      setToast(json.message ?? "Done");
      router.refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    return (
      <p className="mt-6 text-[14px] text-mutedbrown">
        Nothing open. Reports arrive from Profile, and from the chat screen whenever an
        answer fails.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {toast ? <p className="text-[14px] text-mutedbrown">{toast}</p> : null}

      {rows.map((r) => {
        const ctx = (r.context ?? {}) as Record<string, string | undefined>;
        return (
          <div key={r.id} className="card px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-[16px] font-bold">
                {AREA_LABEL[r.area] ?? r.area}
              </span>
              <span className="text-[13px] text-mutedbrown">
                {new Date(r.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {r.reporter_email ? ` · ${r.reporter_email}` : " · signed out"}
              </span>
            </div>

            {/* Their words, kept whole and not truncated. It is the report. */}
            <p className="mt-2 whitespace-pre-wrap text-[15px]">{r.message}</p>

            {ctx.lastError ? (
              <p className="why mt-3 rounded px-3 py-2 text-[13px]">
                On screen at the time: {ctx.lastError}
              </p>
            ) : null}

            <p className="mt-2 text-[12px] text-mutedbrown">
              {[
                ctx.screen ? `screen ${ctx.screen}` : null,
                ctx.platform ? `${ctx.platform}` : null,
                ctx.appVersion ? `v${ctx.appVersion}` : null,
                ctx.buildNumber ? `build ${ctx.buildNumber}` : null,
                /* The one field that turns "chat is broken" into something replayable. */
                ctx.conversationId ? `conversation ${ctx.conversationId}` : null,
                ctx.planId ? `plan ${ctx.planId}` : null,
                r.reporter_device ? `device ${r.reporter_device.slice(0, 8)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "no context sent"}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="What was done about it"
                className="min-w-[220px] flex-1 rounded border px-3 py-1.5 text-[14px]"
              />
              <button
                type="button"
                onClick={() => void act(r.id, "actioned")}
                disabled={busy === r.id + "actioned"}
                className="btn-primary px-3 py-1.5 text-[14px]"
              >
                {busy === r.id + "actioned" ? "Saving" : "Fixed"}
              </button>
              <button
                type="button"
                onClick={() => void act(r.id, "dismissed")}
                disabled={busy === r.id + "dismissed"}
                className="btn-secondary px-3 py-1.5 text-[14px]"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
