import type { ReactNode } from "react";

/**
 * How people respond once Duro shows them this venue (venue_response, 0094):
 * kept or swapped out, for every venue; the detail with Portal Pro.
 *
 * Counts only. The function never sends a device, an account or a time, and
 * the page could not show one if it wanted to.
 */
export interface VenueResponseData {
  pro: boolean;
  pro_until: string | null;
  shown: number;
  kept: number;
  swapped: number;
  detail: {
    menu_opened: number;
    details_opened: number;
    book_tapped: number;
    directions_tapped: number;
    saved: number;
    views: number;
    dwell_ms: number | null;
    area_kept: number;
    area_swapped: number;
    dishes_added: { item: string; n: number }[];
    dishes_removed: { item: string; n: number }[];
  } | null;
}

const SUPPORT_EMAIL = "planbyaduro@gmail.com";
const pct = (a: number, b: number) => (a + b > 0 ? Math.round((100 * a) / (a + b)) : null);

export function VenueResponse({ data, areaName, venueName, days }: { data: VenueResponseData; areaName: string; venueName: string; days: number }) {
  const rate = pct(data.kept, data.swapped);
  const d = data.detail;
  const areaRate = d ? pct(d.area_kept, d.area_swapped) : null;

  return (
    <section className="pl-card pl-up mt-5 p-5" style={{ animationDelay: "100ms" }}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[18px] font-bold">How people respond to you</h2>
        {data.pro ? (
          <span className="rounded-full bg-[var(--p-accent-soft)] px-2.5 py-0.5 text-[12.5px] font-bold text-[var(--p-accent-dark)]">
            Pro{data.pro_until ? ` until ${new Date(data.pro_until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
          </span>
        ) : null}
      </div>
      <p className="-mt-2 mb-4 text-[14px] text-[var(--p-muted)]">
        When Duro puts you in someone&apos;s plan, they can keep you or swap you for somewhere else. Last {days} days.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Stat n={data.shown} label="Shown in a plan" />
        <Stat n={data.kept} label="Kept" note="saved, shared, booked or directions" tone="ok" />
        <Stat n={data.swapped} label="Swapped out" note="for somewhere else" tone={data.swapped > data.kept ? "warn" : undefined} />
      </div>

      {d ? (
        <>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Block title="Kept, against the area">
              <Compare label={venueName} value={rate} strong />
              <Compare label={`Other places in ${areaName}`} value={areaRate} />
              <p className="mt-2 text-[13px] text-[var(--p-muted)]">
                {rate == null || areaRate == null
                  ? "Not enough plans yet to compare."
                  : rate >= areaRate
                    ? "People keep you more often than they keep places near you."
                    : "People swap you out more than places near you. Fuller prices, photos and hours are the usual fix."}
              </p>
            </Block>
            <Block title="What they did">
              <Line label="Opened your menu" n={d.menu_opened} />
              <Line label="Opened your details" n={d.details_opened} />
              <Line label="Tapped Book or Reserve" n={d.book_tapped} />
              <Line label="Asked for directions" n={d.directions_tapped} />
              <Line label="Saved or shared a plan with you" n={d.saved} />
              <Line
                label="Visited your page"
                n={d.views}
                extra={d.dwell_ms ? `about ${Math.max(1, Math.round(d.dwell_ms / 1000))}s each` : undefined}
              />
            </Block>
            <Block title="Dishes people add">
              <Dishes rows={d.dishes_added} empty="Nobody has added a dish yet." tone="ok" />
            </Block>
            <Block title="Dishes people take off">
              <Dishes rows={d.dishes_removed} empty="Nobody has taken a dish off yet." tone="warn" />
              {d.dishes_removed.length ? (
                <p className="mt-2 text-[13px] text-[var(--p-muted)]">
                  Often a price that looks high next to the rest of the menu, or a name that doesn&apos;t say what it is.
                  A short note on the dish helps.
                </p>
              ) : null}
            </Block>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-[var(--p-sunken)] p-4">
          <div className="text-[15px] font-bold">See the rest with Portal Pro</div>
          <ul className="mt-2 grid gap-1 text-[14px] text-[var(--p-ink-2)] sm:grid-cols-2">
            <li>• How often you&apos;re kept, against places near you</li>
            <li>• Menu opens, Book taps and directions</li>
            <li>• Page visits and time spent</li>
            <li>• The dishes people add, and the ones they take off</li>
          </ul>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Portal Pro for ${venueName}`)}`}
            className="pl-btn-soft mt-3 !min-h-[44px] text-[15px]"
          >
            Ask about Pro
          </a>
        </div>
      )}
    </section>
  );
}

function Stat({ n, label, note, tone }: { n: number; label: string; note?: string; tone?: "ok" | "warn" }) {
  const colour = tone === "ok" ? "text-[var(--p-ok)]" : tone === "warn" ? "text-[var(--p-warn)]" : "";
  return (
    <div className="rounded-2xl bg-[var(--p-sunken)] p-3">
      <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--p-muted)]">{label}</div>
      <div className={`mt-0.5 text-[28px] font-bold tabular-nums leading-tight ${colour}`}>{Number(n ?? 0).toLocaleString()}</div>
      {note ? <div className="text-[12px] leading-snug text-[var(--p-muted)]">{note}</div> : null}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-bold">{title}</h3>
      {children}
    </div>
  );
}

function Compare({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-[14px]">
        <span className={`truncate ${strong ? "font-bold" : ""}`}>{label}</span>
        <span className="font-bold tabular-nums">{value == null ? "–" : `${value}%`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--p-sunken)]">
        <div
          className={`pl-grow h-full rounded-full ${strong ? "bg-[var(--p-accent)]" : "bg-[#c9b9b2]"}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function Line({ label, n, extra }: { label: string; n: number; extra?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--p-line)] py-1.5 text-[14px] last:border-0">
      <span>
        {label}
        {extra ? <span className="text-[var(--p-muted)]"> · {extra}</span> : null}
      </span>
      <span className="font-bold tabular-nums">{Number(n ?? 0).toLocaleString()}</span>
    </div>
  );
}

function Dishes({ rows, empty, tone }: { rows: { item: string; n: number }[]; empty: string; tone: "ok" | "warn" }) {
  if (!rows.length) return <p className="text-[14px] text-[var(--p-muted)]">{empty}</p>;
  return (
    <ul className="grid gap-1.5 text-[14px]">
      {rows.map((r) => (
        <li key={r.item} className="flex items-center justify-between gap-3">
          <span className="truncate">{r.item}</span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold tabular-nums ${
              tone === "ok" ? "bg-[var(--p-ok-soft)] text-[var(--p-ok)]" : "bg-[var(--p-warn-soft)] text-[var(--p-warn)]"
            }`}
          >
            {r.n}
          </span>
        </li>
      ))}
    </ul>
  );
}
