import type { AdminCounts } from "@/lib/adminCounts";
import type { IconName } from "./AdminIcon";

/**
 * Every place in the admin, once: the sidebar draws it, the search (Ctrl K)
 * jumps through it, and the phone's top bar names the page from it.
 */
export interface AdminLink {
  href: string;
  label: string;
  icon: IconName;
  /** Which count, if any, belongs on this link. */
  badge?: keyof AdminCounts;
  /** Draw the badge as work waiting rather than a neutral tally. */
  urgent?: boolean;
  /** Other words someone might type to find it. */
  keywords?: string;
}

export const ADMIN_GROUPS: { label: string; links: AdminLink[] }[] = [
  {
    label: "Overview",
    links: [{ href: "/admin", label: "Today", icon: "home", keywords: "dashboard home overview queues" }],
  },
  {
    label: "Needs work",
    links: [
      { href: "/admin/reports", label: "Venue reports", icon: "flag", badge: "openReports", urgent: true, keywords: "closed wrong" },
      { href: "/admin/issues", label: "Problem reports", icon: "bug", badge: "openIssues", urgent: true, keywords: "bugs app issues" },
      { href: "/admin/phones", label: "Phone review", icon: "phone", badge: "phonesPending", urgent: true, keywords: "numbers approve" },
      { href: "/admin/unpriced", label: "Unpriced venues", icon: "tag", badge: "unpriced", keywords: "price missing" },
      { href: "/admin/menus", label: "Thin menus", icon: "list", badge: "thinMenus", keywords: "few dishes" },
      { href: "/admin/prices", label: "Bulk price edit", icon: "pencil", badge: "staleMenus", keywords: "stale prices" },
      { href: "/admin/kitchens", label: "Kitchens", icon: "chef", keywords: "shared menu branches" },
    ],
  },
  {
    label: "Catalogue",
    links: [
      { href: "/admin/venues", label: "Venues", icon: "store", badge: "venues", keywords: "restaurants places bars" },
      { href: "/admin/areas", label: "Areas", icon: "map", keywords: "neighbourhoods towns" },
      { href: "/admin/events", label: "Events", icon: "calendar", keywords: "shows concerts" },
      { href: "/admin/getting-around", label: "Getting around", icon: "bus", keywords: "trotro transit routes" },
      { href: "/admin/gifts", label: "Flowers and cakes", icon: "gift", keywords: "add-ons gifts" },
      { href: "/admin/vendors", label: "Cake and flower shops", icon: "bag", badge: "vendorApplications", urgent: true, keywords: "vendor applications" },
      { href: "/admin/featured", label: "Featured this week", icon: "star", keywords: "shelf promote" },
    ],
  },
  {
    label: "Add data",
    links: [
      { href: "/admin/venues/new", label: "Add a venue", icon: "plus", keywords: "new create" },
      { href: "/admin/discover", label: "Discover venues", icon: "compass", keywords: "google find search" },
      { href: "/admin/import", label: "Import", icon: "upload", keywords: "csv menu photo reader gemini" },
      { href: "/admin/gaderin", label: "Gaderin", icon: "sparkles", badge: "gaderinWaiting", keywords: "activities" },
    ],
  },
  {
    label: "Insights",
    links: [
      { href: "/admin/demand", label: "Demand", icon: "chart", keywords: "plans searches requests" },
      { href: "/admin/pull", label: "Pull", icon: "pulse", keywords: "kept swapped signals ranking popular" },
      { href: "/admin/sharing", label: "Sharing", icon: "share", keywords: "shares links" },
      { href: "/admin/poll", label: "Name poll", icon: "vote", keywords: "votes" },
    ],
  },
  {
    label: "People",
    links: [
      { href: "/admin/reservations", label: "Reservations", icon: "bookmark", keywords: "bookings" },
      { href: "/admin/venue-logins", label: "Venue logins", icon: "key", keywords: "portal owners" },
      { href: "/admin/planners", label: "Event planners", icon: "users", keywords: "planner accounts" },
      { href: "/admin/planners/activity", label: "Planner activity", icon: "pulse", keywords: "log" },
    ],
  },
];

export const ADMIN_LINKS = ADMIN_GROUPS.flatMap((g) => g.links);

/**
 * The link for a path: the most specific one that matches, so
 * /admin/planners/activity lights up alone and a venue's own page lights up
 * Venues. Today matches only itself.
 */
export function activeLink(pathname: string): AdminLink | undefined {
  return ADMIN_LINKS.filter((l) => pathname === l.href || (l.href !== "/admin" && pathname.startsWith(`${l.href}/`))).sort(
    (a, b) => b.href.length - a.href.length
  )[0];
}

/** What a link's badge shows: the phone queue counts reported numbers too. */
export function badgeCount(l: AdminLink, counts: AdminCounts | null): number {
  if (!counts || !l.badge) return 0;
  if (l.badge === "phonesPending") return (counts.phonesPending ?? 0) + (counts.phonesReported ?? 0);
  return counts[l.badge] ?? 0;
}

/** Rose only when someone is waiting: numbers to approve are a backlog, a reported number is not. */
export function badgeUrgent(l: AdminLink, counts: AdminCounts | null): boolean {
  if (!l.urgent || !counts) return false;
  if (l.badge === "phonesPending") return (counts.phonesReported ?? 0) > 0;
  return true;
}
