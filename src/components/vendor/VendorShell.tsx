"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar, Wordmark } from "@/components/planner/PlannerShell";
import { IconCalendar, IconImage, IconUser } from "@/components/planner/icons";

const TABS = [
  { href: "/vendor", label: "Products", icon: IconImage },
  { href: "/vendor/orders", label: "Pickups", icon: IconCalendar },
  { href: "/vendor/details", label: "Details", icon: IconUser },
];

/**
 * A vendor's frame: the same light space as the planner's (.planner), with
 * three tabs, at the bottom on a phone and in the header on a wider screen.
 */
export function VendorShell({ name, logoUrl, children }: { name: string; logoUrl: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const on = (href: string) => (href === "/vendor" ? pathname === "/vendor" : pathname.startsWith(href));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--p-line)] bg-[rgb(251_247_244/0.86)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1040px] items-center gap-4 px-4 md:px-6">
          <Link href="/vendor" className="flex items-center gap-2.5" aria-label="Your products">
            <Wordmark height={24} />
            <span className="hidden rounded-full bg-[var(--p-accent-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--p-accent-dark)] sm:inline">
              for vendors
            </span>
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Vendor">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on(t.href) ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${
                  on(t.href) ? "bg-[var(--p-ink)] text-white" : "text-[var(--p-ink-2)] hover:bg-[var(--p-sunken)]"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <Link href="/vendor/details" aria-label="Your details" className="ml-auto rounded-xl transition-transform active:scale-95">
            <Avatar name={name} logoUrl={logoUrl} size={38} />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1040px] px-4 pb-32 pt-5 md:px-6 md:pb-16 md:pt-8">{children}</main>

      <nav aria-label="Vendor" className="pl-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--p-line)] bg-white/95 backdrop-blur-md md:hidden">
        <div className="mx-auto grid max-w-[520px] grid-cols-3 px-2 pt-2">
          {TABS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={on(href) ? "page" : undefined}
              className={`pl-tap flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] font-semibold ${
                on(href) ? "text-[var(--p-accent)]" : "text-[var(--p-muted)]"
              }`}
            >
              <Icon size={24} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
