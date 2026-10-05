"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "./Sheet";
import { IconCopy, IconEdit, IconPlus, IconTrash, IconWarn } from "./icons";
import { dateParts, friendlyDate, friendlyTime, kindEmoji, kindLabel, todayIso, type Night } from "./nights";

export interface ListedNight extends Night {
  placeName: string;
  area: string;
}

/**
 * Their nights, coming up first and the past folded away.
 *
 * Each card says the three things a planner checks before a weekend: when,
 * where, and whether it is set up to be picked (a price and a poster). The
 * actions are the ones they need: change it, run it again, take it down.
 */
export function NightsList({ nights: initial, notice }: { nights: ListedNight[]; notice: string | null }) {
  const router = useRouter();
  const [nights, setNights] = useState(initial);
  const [removing, setRemoving] = useState<ListedNight | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(notice);

  useEffect(() => setNights(initial), [initial]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    // The notice came on the address; take it off so a refresh does not repeat it.
    if (notice) router.replace("/planner", { scroll: false });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  async function remove(n: ListedNight) {
    setBusy(true);
    const { error } = await createClient().from("events").delete().eq("id", n.id);
    setBusy(false);
    setRemoving(null);
    if (error) return setToast("We could not delete that. Try again.");
    setGone(n.id);
    setTimeout(() => {
      setNights((cur) => cur.filter((x) => x.id !== n.id));
      setGone(null);
    }, 280);
    setToast("Deleted. It is out of plans now.");
  }

  const today = todayIso();
  const upcoming = nights.filter((n) => n.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const past = nights.filter((n) => n.event_date < today).sort((a, b) => b.event_date.localeCompare(a.event_date));

  return (
    <div>
      {upcoming.length ? (
        <div className="grid gap-3">
          {upcoming.map((n, i) => (
            <NightCard key={n.id} n={n} index={i} leaving={gone === n.id} onDelete={() => setRemoving(n)} />
          ))}
        </div>
      ) : (
        <EmptyNights hasPast={past.length > 0} />
      )}

      {past.length ? (
        <details className="group mt-8">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-[15px] font-bold ring-1 ring-[var(--p-line)]">
            Past nights ({past.length})
            <span className="text-[var(--p-muted)] transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-3 grid gap-3 opacity-80">
            {past.slice(0, 30).map((n, i) => (
              <NightCard key={n.id} n={n} index={i} past leaving={gone === n.id} onDelete={() => setRemoving(n)} />
            ))}
          </div>
        </details>
      ) : null}

      <Sheet open={Boolean(removing)} onClose={() => setRemoving(null)} title="Delete this night?">
        <p className="text-[15px] text-[var(--p-ink-2)]">
          {removing?.title} on {removing ? friendlyDate(removing.event_date) : ""} comes out of plans straight away. Plans people already saved keep it.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <button type="button" className="pl-btn !bg-[#b42318]" disabled={busy} onClick={() => removing && void remove(removing)}>
            {busy ? "Deleting…" : "Delete it"}
          </button>
          <button type="button" className="pl-btn-ghost" onClick={() => setRemoving(null)}>
            Keep it
          </button>
        </div>
      </Sheet>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-6 md:bottom-8">
          <div className="pl-up rounded-full bg-[var(--p-ink)] px-5 py-3 text-[14.5px] font-semibold text-white shadow-xl">{toast}</div>
        </div>
      ) : null}
    </div>
  );
}

function NightCard({
  n,
  index,
  past = false,
  leaving,
  onDelete,
}: {
  n: ListedNight;
  index: number;
  past?: boolean;
  leaving: boolean;
  onDelete: () => void;
}) {
  const p = dateParts(n.event_date);
  const soon = !past && n.event_date <= new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
  const priced = n.cost_ghs != null;

  return (
    <article
      className={`pl-card pl-up overflow-hidden transition-all duration-300 ${leaving ? "scale-95 opacity-0" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex gap-3.5 p-3.5">
        <div
          className={`flex w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl py-2 ${
            soon ? "bg-[var(--p-accent)] text-white" : "bg-[var(--p-sunken)] text-[var(--p-ink)]"
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-80">{p.day}</span>
          <span className="text-[24px] font-bold leading-none">{p.date}</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-80">{p.month}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[17px] font-bold leading-snug">{n.title}</h3>
              <div className="truncate text-[13.5px] text-[var(--p-muted)]">
                {friendlyTime(n.start_time)}
                {n.placeName ? ` · ${n.placeName}` : ""}
                {n.area ? `, ${n.area}` : ""}
              </div>
            </div>
            {n.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-black/5" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--p-sunken)] text-[22px]" aria-hidden>
                {kindEmoji(n.category)}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[var(--p-sunken)] px-2.5 py-1 text-[12px] font-semibold text-[var(--p-ink-2)]">{kindLabel(n.category)}</span>
            {priced ? (
              <span className="rounded-full bg-[var(--p-ok-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--p-ok)]">
                {Number(n.cost_ghs) === 0 ? "Free entry" : `GHS ${Math.round(Number(n.cost_ghs))}`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--p-warn-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--p-warn)]">
                <IconWarn size={12} /> No price yet
              </span>
            )}
            {n.audience && n.audience !== "everyone" ? (
              <span className="rounded-full bg-[var(--p-sunken)] px-2.5 py-1 text-[12px] font-semibold text-[var(--p-ink-2)]">
                {n.audience === "women" ? "Ladies only" : "Men only"}
              </span>
            ) : null}
            {!past && !n.image_url ? (
              <span className="rounded-full bg-[var(--p-sunken)] px-2.5 py-1 text-[12px] font-semibold text-[var(--p-muted)]">No poster</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-[var(--p-line)] text-[13.5px] font-bold">
        {!past ? (
          <Link href={`/planner/nights/${n.id}`} className="pl-tap flex items-center justify-center gap-1.5 py-3 text-[var(--p-ink-2)] transition-colors hover:bg-[var(--p-sunken)]">
            <IconEdit size={17} /> Edit
          </Link>
        ) : (
          <span className="flex items-center justify-center py-3 text-[var(--p-muted)]">Done</span>
        )}
        <Link
          href={`/planner/nights/new?from=${n.id}`}
          className="pl-tap flex items-center justify-center gap-1.5 border-x border-[var(--p-line)] py-3 text-[var(--p-ink-2)] transition-colors hover:bg-[var(--p-sunken)]"
        >
          <IconCopy size={17} /> Run again
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="pl-tap flex items-center justify-center gap-1.5 py-3 text-[#b42318] transition-colors hover:bg-[#fdecea]"
        >
          <IconTrash size={17} /> Delete
        </button>
      </div>
    </article>
  );
}

function EmptyNights({ hasPast }: { hasPast: boolean }) {
  return (
    <div className="pl-card pl-up flex flex-col items-center px-6 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mascots/friend_outing.png" alt="" className="pl-float h-28 w-28 [image-rendering:pixelated]" />
      <h3 className="mt-4 text-[20px] font-bold">{hasPast ? "Nothing coming up" : "No nights yet"}</h3>
      <p className="mt-1.5 max-w-[340px] text-[15px] text-[var(--p-muted)]">
        {hasPast
          ? "Your last nights are below. Run one again, or put on something new."
          : "Put your first night on and it can start showing up in people's plans today."}
      </p>
      <Link href="/planner/nights/new" className="pl-btn pl-pulse mt-6">
        <IconPlus size={20} /> Put a night on
      </Link>
    </div>
  );
}
