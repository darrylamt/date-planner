/**
 * Turning a venue's username into the address Supabase insists on.
 *
 * Its own module, with nothing server-only in it, because the portal's login
 * form is a client component and needs the same mapping the server does. The
 * gate in venueAuth.ts reads cookies through next/headers, and importing that
 * from a client component fails the whole build, so the two are kept apart
 * rather than one importing the other.
 */

/**
 * Venues have usernames, not email addresses.
 *
 * Most have no inbox they check and the ones that do share it with everybody,
 * so an emailed login link is a login anybody in the building can use.
 * Supabase requires an email, so one is synthesised against a domain that
 * receives no mail.
 *
 * The dead domain is the point rather than a shortcut: a portal account cannot
 * start a password reset it can complete, so the only way to recover one is to
 * ask an admin to reissue it. That is the correct amount of ceremony for a
 * credential that can change what a restaurant charges.
 */
export const VENUE_EMAIL_DOMAIN = "venues.aduro.app";

/** "kwame" → "kwame@venues.aduro.app". Lowercased, because logins are typed. */
export function emailForUsername(username: string): string {
  return `${username.trim().toLowerCase()}@${VENUE_EMAIL_DOMAIN}`;
}

/**
 * What a username may be.
 *
 * Narrow on purpose: it goes into an email address, so anything that is not a
 * plain word makes an address that either fails validation or, worse, quietly
 * addresses something else.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normaliseUsername(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  return USERNAME_PATTERN.test(name) ? name : null;
}
