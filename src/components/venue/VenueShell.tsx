"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Wordmark } from "@/components/planner/PlannerShell";
import { Sheet } from "@/components/planner/Sheet";
import { IconBack, IconChart, IconCheck, IconChevron, IconFork, IconHelp, IconHome, IconMusic, IconStore } from "@/components/planner/icons";

export interface PortalVenue {
  id: string;
  name: string;
  area: string | null;
}

const TABS = [
  { href: "/venue", label: "Home", icon: IconHome },
  { href: "/venue/menu", label: "Menu", icon: IconFork },
  { href: "/venue/whats-on", label: "What's on", icon: IconMusic },
  { href: "/venue/listing", label: "Your place", icon: IconStore },
  { href: "/venue/insights", label: "Insights", icon: IconChart },
];

/**
 * Every venue page's frame, in the planner's light theme.
 *
 * Five tabs, at the bottom on a phone where a thumb is and in the header on a
 * wider screen. A group with branches switches between them from the name
 * under the header; the choice rides on every link as ?venue=, so a refresh
 * or a shared link shows the same branch.
 */
export function VenueShell({
  venues,
  current,
  imageUrl,
  children,
  back,
}: {
  venues: PortalVenue[];
  current: PortalVenue;
  imageUrl: string | null;
  children: ReactNode;
  /** A sub-page's way back, shown in place of the page's own tab highlight. */
  back?: { href: string; label: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const many = venues.length > 1;
  const withVenue = (href: string) => (many ? `${href}${href.includes("?") ? "&" : "?"}venue=${current.id}` : href);
  const on = (href: string) =>
    href === "/venue" ? pathname === "/venue" : href === "/venue/listing" ? pathname.startsWith("/venue/listing") || pathname.startsWith("/venue/hours") : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--p-line)] bg-[rgb(251_247_244/0.86)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1040px] items-center gap-4 px-4 md:px-6">
          <Link href={withVenue("/venue")} className="flex items-center gap-2.5" aria-label="Home">
            <Wordmark height={24} />
            <span className="hidden rounded-full bg-[var(--p-accent-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--p-accent-dark)] sm:inline">
              for venues
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Portal">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={withVenue(t.href)}
                aria-current={on(t.href) ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${
                  on(t.href) ? "bg-[var(--p-ink)] text-white" : "text-[var(--p-ink-2)] hover:bg-[var(--p-sunken)]"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href={withVenue("/venue/help")}
              aria-label="Help"
              className={`pl-tap grid h-10 w-10 place-items-center rounded-xl transition-colors ${
                pathname.startsWith("/venue/help") ? "bg-[var(--p-ink)] text-white" : "text-[var(--p-ink-2)] hover:bg-[var(--p-sunken)]"
              }`}
            >
              <IconHelp size={22} />
            </Link>
            <Link href={withVenue("/venue/listing")} aria-label="Your place" className="rounded-xl transition-transform active:scale-95">
              <Avatar name={current.name} logoUrl={imageUrl} size={38} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1040px] px-4 pb-36 pt-4 md:px-6 md:pt-7 lg:pb-20">
        {/* Which branch, for a group; one tap to change it. */}
        {many ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="pl-tap pl-fade mb-4 inline-flex max-w-full items-center gap-2 rounded-full bg-white py-2 pl-3 pr-3.5 text-[14px] font-bold ring-1 ring-[var(--p-line)]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--p-ok)]" />
            <span className="truncate">
              {current.name}
              {current.area ? <span className="font-semibold text-[var(--p-muted)]"> · {current.area}</span> : null}
            </span>
            <span className="text-[var(--p-muted)]">Change</span>
          </button>
        ) : null}

        {back ? (
          <Link href={withVenue(back.href)} className="pl-fade mb-3 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[var(--p-muted)] hover:text-[var(--p-ink)]">
            <IconBack size={18} /> {back.label}
          </Link>
        ) : null}

        {children}
      </main>

      <nav
        aria-label="Portal"
        className="pl-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--p-line)] bg-white/95 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid max-w-[560px] grid-cols-5 px-1 pt-1.5">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = on(href);
            return (
              <Link
                key={href}
                href={withVenue(href)}
                aria-current={active ? "page" : undefined}
                className={`pl-tap relative flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] font-semibold transition-colors ${
                  active ? "text-[var(--p-accent)]" : "text-[var(--p-muted)]"
                }`}
              >
                <span className={`grid h-8 w-14 place-items-center rounded-full transition-all duration-300 ${active ? "bg-[var(--p-accent-soft)]" : ""}`}>
                  <Icon size={22} />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Which branch?">
        <div className="flex flex-col gap-2">
          {venues.map((v, i) => {
            const isOn = v.id === current.id;
            return (
              <button
                key={v.id}
                type="button"
                className={`pl-up pl-tap flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 transition-colors ${
                  isOn ? "bg-[var(--p-accent-soft)] ring-[var(--p-accent)]" : "bg-white ring-[var(--p-line)] hover:ring-[var(--p-accent)]"
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => {
                  setPicking(false);
                  const params = new URLSearchParams(window.location.search);
                  params.set("venue", v.id);
                  router.push(`${pathname}?${params.toString()}`);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold">{v.name}</span>
                  {v.area ? <span className="block text-[13.5px] text-[var(--p-muted)]">{v.area}</span> : null}
                </span>
                {isOn ? (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--p-accent)] text-white">
                    <IconCheck size={15} />
                  </span>
                ) : (
                  <IconChevron className="text-[var(--p-muted)]" />
                )}
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
