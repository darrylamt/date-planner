"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const VENUE_TABS = [
  { href: "/venue", label: "Bookings" },
  { href: "/venue/listing", label: "Your listing" },
  { href: "/venue/hours", label: "Hours" },
  { href: "/venue/menu", label: "Menu" },
  { href: "/venue/whats-on", label: "What's on" },
];

/*
 * A planner's tabs, which are not a subset chosen to be tidy.
 *
 * Menu and Hours are absent because a pop-up has neither: what it costs is
 * the door price on the event and when it is open is the event's own start
 * time, so both screens would ask questions whose only possible answers are
 * invented. Bookings is absent because nothing takes reservations at a place
 * that exists for one night.
 *
 * What is left is the two things a planner actually does, in the order they
 * do them: add the place, then say what is on there.
 */
const PLANNER_TABS = [
  { href: "/venue/locations", label: "Locations" },
  { href: "/venue/whats-on", label: "What's on" },
  { href: "/venue/listing", label: "Details" },
];

/**
 * The portal's whole navigation.
 *
 * A handful of tabs and a sign-out, because a venue opens this to do one
 * thing and leave. The admin's sidebar has sixteen entries and would read as
 * somebody else's tool.
 */
export function VenueNav({
  venues,
  currentVenueId,
  planner = null,
}: {
  venues: { id: string; name: string; area: string | null }[];
  currentVenueId: string;
  /** Set when this login is an event planner. See migration 0046. */
  planner?: { username: string; displayName: string } | null;
}) {
  const TABS = planner ? PLANNER_TABS : VENUE_TABS;
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  /*
   * The chosen venue rides on every link rather than being stored.
   *
   * A group with four branches switches between them constantly, and a stored
   * choice means the tab you open in a second window quietly shows a different
   * restaurant from the one in the first. A query parameter can be linked to,
   * survives a refresh, and cannot fall out of step with what is on screen.
   */
  const withVenue = (href: string) =>
    venues.length > 1 ? `${href}?venue=${currentVenueId}` : href;

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/venue/login");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-5 pt-5">
      {venues.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-mutedbrown">{planner ? "Location" : "Showing"}</span>
          <select
            className="inp h-[34px] w-auto"
            value={currentVenueId}
            onChange={(e) => {
              const next = new URLSearchParams(params.toString());
              next.set("venue", e.target.value);
              router.push(`${pathname}?${next.toString()}`);
            }}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.area ? ` — ${v.area}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            // Exact match for the dashboard, prefix for the rest, or every tab
            // lights up at once on "/venue".
            const on = tab.href === "/venue" ? pathname === "/venue" : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={withVenue(tab.href)}
                className={`rounded-md px-3 py-1.5 text-[14px] font-semibold transition-colors ${
                  on ? "bg-flame text-blush" : "text-cocoa hover:text-flame"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => void signOut()}
          className="text-[13px] font-semibold text-mutedbrown hover:text-flame"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
