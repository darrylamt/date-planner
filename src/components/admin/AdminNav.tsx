"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/admin", label: "Venues" },
  { href: "/admin/unpriced", label: "Unpriced venues" },
  { href: "/admin/prices", label: "Bulk price edit" },
  { href: "/admin/phones", label: "Phone review" },
  { href: "/admin/reservations", label: "Reservations" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/areas", label: "Areas" },
  { href: "/admin/ingest", label: "Add from menu" },
  { href: "/admin/import", label: "Import CSV" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="flex flex-row flex-wrap gap-0.5 md:flex-1 md:flex-col">
      {LINKS.map((l) => {
        const on =
          l.href === "/admin"
            ? pathname === "/admin" || pathname.startsWith("/admin/venues")
            : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`snav ${on ? "snav-on" : ""}`}>
            {l.label}
          </Link>
        );
      })}
      <button onClick={signOut} className="snav mt-auto text-left">
        Sign out
      </button>
    </nav>
  );
}
