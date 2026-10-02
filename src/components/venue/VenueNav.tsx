"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const VENUE_TABS = [
  { href: "/venue", label: "Bookings" },
  { href: "/venue/insights", label: "Insights" },
  { href: "/venue/listing", label: "Your listing" },
  { href: "/venue/hours", label: "Hours" },
  { href: "/venue/menu", label: "Menu" },
  { href: "/venue/whats-on", label: "What's on" },
  { href: "/venue/help", label: "Help" },
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
 * What's on comes first because it is what a planner opens the portal to do,
 * and where they land. Then the places they hold nights at, the details of
 * those places and their own logo, and a way to reach us.
 */
const PLANNER_TABS = [
  { href: "/venue/whats-on", label: "What's on" },
  { href: "/venue/locations", label: "Locations" },
  { href: "/venue/listing", label: "Details" },
  { href: "/venue/help", label: "Help" },
];

/**
 * The portal's whole navigation.
 *
 * Who is signed in, a handful of tabs and a sign-out, because a venue opens
 * this to do one thing and leave. The admin's sidebar has sixteen entries and
 * would read as somebody else's tool.
 */
export function VenueNav({
  venues,
  currentVenueId,
  planner = null,
}: {
  venues: { id: string; name: string; area: string | null }[];
  currentVenueId: string;
  /** Set when this login is an event planner. See migration 0046. */
  planner?: { username: string; displayName: string; logoUrl?: string | null } | null;
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
    venues.length > 1 && currentVenueId ? `${href}?venue=${currentVenueId}` : href;

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/venue/login");
    router.refresh();
  }

  const who = planner?.displayName ?? venues.find((v) => v.id === currentVenueId)?.name ?? venues[0]?.name ?? "";

  return (
    <div className="mx-auto w-full max-w-[1080px] px-5 pt-5">
      {/* Who this is: their logo when a planner has one, else their initial. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {planner?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={planner.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain ring-1 ring-black/10" />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-flame text-[17px] font-bold text-blush">
              {who.charAt(0).toUpperCase() || "D"}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold">{who}</div>
            <div className="text-[12px] text-mutedbrown">{planner ? "Event planner" : "Venue"}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {venues.length > 1 ? (
            <select
              aria-label={planner ? "Location" : "Venue"}
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
          ) : null}
          <button
            onClick={() => void signOut()}
            className="text-[13px] font-semibold text-mutedbrown hover:text-flame"
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-line pb-2">
        {TABS.map((tab) => {
          // Exact match for the dashboard, prefix for the rest, or every tab
          // lights up at once on "/venue".
          const on = tab.href === "/venue" ? pathname === "/venue" : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={withVenue(tab.href)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[14px] font-semibold transition-colors ${
                on ? "bg-flame text-blush" : "text-cocoa hover:bg-flame/10 hover:text-flame"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
