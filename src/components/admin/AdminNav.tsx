"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AdminCounts } from "@/lib/adminCounts";

/**
 * The admin sidebar.
 *
 * Grouped and badged rather than a flat list of nine equal links: the queues
 * that need work now look different from the tools you reach for occasionally,
 * and a count on the link means you can see there is work without opening the
 * page to find out.
 */
const GROUPS: {
  label: string;
  links: {
    href: string;
    label: string;
    /** Which count, if any, belongs on this link. */
    badge?: keyof AdminCounts;
    /** Draw the badge as a warning rather than a neutral tally. */
    urgent?: boolean;
  }[];
}[] = [
  {
    label: "Catalogue",
    links: [
      { href: "/admin", label: "Venues", badge: "venues" },
      { href: "/admin/areas", label: "Areas" },
      { href: "/admin/events", label: "Events" },
    ],
  },
  {
    label: "Needs work",
    links: [
      { href: "/admin/reports", label: "Reports", badge: "openReports", urgent: true },
      { href: "/admin/phones", label: "Phone review", badge: "phonesPending", urgent: true },
      { href: "/admin/unpriced", label: "Unpriced venues", badge: "unpriced", urgent: true },
      { href: "/admin/prices", label: "Bulk price edit", badge: "staleMenus" },
    ],
  },
  {
    label: "Add data",
    links: [
      { href: "/admin/discover", label: "Discover venues" },
      { href: "/admin/venues/new", label: "Add a venue" },
      { href: "/admin/ingest", label: "Add from prices" },
      { href: "/admin/import", label: "Import CSV" },
    ],
  },
  {
    label: "Operations",
    links: [{ href: "/admin/reservations", label: "Reservations" }],
  },
];

export function AdminNav({ counts }: { counts: AdminCounts }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="flex flex-1 flex-col gap-4">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-6 pb-1 text-[11px] uppercase tracking-wide text-lagoon-soft">
            {group.label}
          </div>
          <div className="flex flex-row flex-wrap gap-0.5 md:flex-col">
            {group.links.map((l) => {
              const on =
                l.href === "/admin"
                  ? pathname === "/admin" ||
                    (pathname.startsWith("/admin/venues") && pathname !== "/admin/venues/new")
                  : pathname === l.href || pathname.startsWith(`${l.href}/`);

              const n = l.badge ? counts[l.badge] : 0;

              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`snav flex items-center justify-between gap-2 ${on ? "snav-on" : ""}`}
                >
                  <span>{l.label}</span>
                  {n > 0 ? (
                    <span
                      className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                        l.urgent
                          ? "bg-staletext text-white"
                          : "bg-lagoon-soft/25 text-lagoon-soft"
                      }`}
                    >
                      {n}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={signOut} className="snav mt-auto text-left">
        Sign out
      </button>
    </nav>
  );
}
