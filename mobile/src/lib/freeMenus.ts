/**
 * Every venue's full page, free for everyone, for a while.
 *
 * Menus, hours and the ways to book are Pro. For the first weeks after the
 * Duro! launch they are open to everybody: more people reading menus means
 * more dishes recommended and more reasons to come back, and the people who
 * find the prices real are the people who will pay for Durobot.
 *
 * Said wherever it applies (the venue page, the paywall's list), so it reads
 * as a gift with a date on it rather than something taken away later, and it
 * ends by itself at the end of the day below, Accra time (UTC). Changing the
 * date is a one-line update over the air.
 */
export const MENUS_FREE_UNTIL = "2026-11-30";

/**
 * Whether the end date is said anywhere. Off since 23 Oct 2026, at the
 * owner's word: menus stay free, the date stays here, and no screen counts
 * down to it until it is decided whether the free months are extended.
 */
export const SAY_MENUS_FREE_UNTIL = false;

/** How the date is said: "30 November". */
export const MENUS_FREE_LABEL = new Date(`${MENUS_FREE_UNTIL}T12:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function menusFree(now = new Date()): boolean {
  return now.getTime() <= Date.parse(`${MENUS_FREE_UNTIL}T23:59:59Z`);
}
