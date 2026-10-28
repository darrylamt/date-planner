/**
 * The staff roles (0095) as plain values, safe in the browser. The access
 * checks that use them are in staff.ts, which is server-only.
 */
export const STAFF_ROLES = ["photos", "menus", "events", "stays"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  photos: "Photos",
  menus: "Menus & prices",
  events: "Events",
  stays: "Stays",
};

export const ROLE_BLURB: Record<StaffRole, string> = {
  photos: "Venue cover photos and galleries, and event images.",
  menus: "Dishes and prices, menu import, cuisines and per-person figures.",
  events: "Events and Gaderin listings.",
  stays: "Places to stay: where they are, rooms and nightly rates, amenities and things to do there (0099).",
};

/** Where each role starts when they sign in. */
export const ROLE_HOME: Record<StaffRole, string> = {
  photos: "/admin/photos",
  menus: "/admin/menu",
  events: "/admin/events",
  stays: "/admin/stays",
};

/** Staff usernames sign in as an address on a domain that cannot receive mail. */
export const STAFF_EMAIL_DOMAIN = "staff.aduro.invalid";
export const staffEmail = (username: string) => `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
