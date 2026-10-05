"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isHalloween } from "@/components/Logo";
import { IconCalendar, IconHelp, IconPin, IconPlus, IconUser } from "./icons";

const TABS = [
  { href: "/planner", label: "Nights", icon: IconCalendar },
  { href: "/planner/places", label: "Places", icon: IconPin },
  { href: "/planner/profile", label: "Profile", icon: IconUser },
  { href: "/planner/help", label: "Help", icon: IconHelp },
];

/** The Duro! wordmark in ink, or the season's logo at Halloween. */
export function Wordmark({ height = 26 }: { height?: number }) {
  if (isHalloween()) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/halloween-logo.png" alt="Duro!" style={{ height: height * 1.3, width: "auto" }} className="rounded-md" />;
  }
  return (
    <span
      role="img"
      aria-label="Duro!"
      className="inline-block"
      style={{
        height,
        width: Math.round(height * (2070 / 756)),
        backgroundColor: "var(--p-ink)",
        WebkitMaskImage: "url(/brand/duro-wordmark.png)",
        maskImage: "url(/brand/duro-wordmark.png)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "left center",
        maskPosition: "left center",
      }}
    />
  );
}

/** Their logo, or the first letter of their name on the brand colour. */
export function Avatar({ name, logoUrl, size = 40 }: { name: string; logoUrl: string | null; size?: number }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-xl bg-white object-contain ring-1 ring-black/10"
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.42, background: "var(--p-accent)" }}
      className="grid shrink-0 place-items-center rounded-xl font-bold text-white"
    >
      {name.charAt(0).toUpperCase() || "D"}
    </span>
  );
}

/**
 * Every planner page's frame.
 *
 * On a phone the tabs are a bar at the bottom, where a thumb is, with the
 * one thing a planner comes here to do in the middle of it: a new night. On
 * a wider screen the same tabs sit in the header. `bare` drops the bar for
 * the step-by-step editor, which has its own Back and Next there instead.
 */
export function PlannerShell({
  name,
  logoUrl,
  children,
  bare = false,
}: {
  name: string;
  logoUrl: string | null;
  children: ReactNode;
  bare?: boolean;
}) {
  const pathname = usePathname();
  const on = (href: string) =>
    href === "/planner" ? pathname === "/planner" || pathname.startsWith("/planner/nights") : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--p-line)] bg-[rgb(251_247_244/0.86)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1040px] items-center gap-4 px-4 md:px-6">
          <Link href="/planner" className="flex items-center gap-2.5" aria-label="Your nights">
            <Wordmark height={24} />
            <span className="hidden rounded-full bg-[var(--p-accent-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--p-accent-dark)] sm:inline">
              for planners
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Planner">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on(t.href) ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${
                  on(t.href)
                    ? "bg-[var(--p-ink)] text-white"
                    : "text-[var(--p-ink-2)] hover:bg-[var(--p-sunken)]"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Wrapped: .pl-btn sets display, which outranks Tailwind's hidden. */}
            {!bare ? (
              <div className="hidden md:block">
                <Link href="/planner/nights/new" className="pl-btn !min-h-[42px] !px-4 !text-[15px]">
                  <IconPlus size={18} /> New night
                </Link>
              </div>
            ) : null}
            <Link href="/planner/profile" aria-label="Your profile" className="rounded-xl transition-transform active:scale-95">
              <Avatar name={name} logoUrl={logoUrl} size={38} />
            </Link>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full max-w-[1040px] px-4 pt-5 md:px-6 md:pt-8 ${bare ? "pb-32" : "pb-32 md:pb-16"}`}>
        {children}
      </main>

      {!bare ? (
        <nav
          aria-label="Planner"
          className="pl-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--p-line)] bg-white/95 backdrop-blur-md md:hidden"
        >
          <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end px-2 pt-2">
            {TABS.slice(0, 2).map((t) => (
              <TabLink key={t.href} {...t} active={on(t.href)} />
            ))}
            <div className="flex justify-center">
              <Link
                href="/planner/nights/new"
                aria-label="New night"
                className="pl-tap -mt-7 grid h-16 w-16 place-items-center rounded-[22px] bg-[var(--p-accent)] text-white shadow-[0_12px_24px_-10px_rgb(201_44_88/0.8)] ring-4 ring-[var(--p-bg)] transition-transform active:scale-95"
              >
                <IconPlus size={30} />
              </Link>
            </div>
            {TABS.slice(2).map((t) => (
              <TabLink key={t.href} {...t} active={on(t.href)} />
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (p: { size?: number }) => JSX.Element;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`pl-tap flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] font-semibold transition-colors ${
        active ? "text-[var(--p-accent)]" : "text-[var(--p-muted)]"
      }`}
    >
      <Icon size={24} />
      {label}
    </Link>
  );
}
