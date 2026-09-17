/**
 * The two things in a chat reply worth tapping.
 *
 * The assistant answers in prose, which is right: a card for every venue it
 * mentions would turn a two-line answer into a screenful. But a phone number
 * in prose is a number you have to select, copy and paste into the dialler,
 * and a handle in prose is a name you have to retype into Instagram, and both
 * of those are the moment somebody gives up on the reply they just paid a
 * message for.
 *
 * So the prose stays prose and anything dialable or openable is offered
 * underneath it as well. Found rather than asked for: the model is told not to
 * invent contact details and is not told to format them specially, and adding
 * a markup instruction to the prompt would be one more rule for it to get
 * subtly wrong on the turn that matters.
 */
export interface ChatLink {
  kind: "phone" | "instagram";
  /** As it appeared in the reply, so the chip and the text agree. */
  label: string;
  /** Where tapping goes. */
  href: string;
}

/**
 * Ghanaian mobile numbers, the two ways anybody writes them.
 *
 * Either the international form or the leading zero, then nine digits with
 * spaces or hyphens wherever the writer felt like putting them. Deliberately
 * not a general phone matcher: this catalogue is Accra, and a loose pattern
 * finds numbers in prices, dates and plan totals.
 *
 * The leading boundary is hand-rolled rather than \b, because \b sits happily
 * between a digit and a plus sign, so "GHS 1200+233..." would match. Requiring
 * a non-digit before the number stops a match starting midway through a longer
 * one.
 */
const PHONE = /(?<![\d+])(\+233[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}|0\d{2}[\s-]?\d{3}[\s-]?\d{4})(?!\d)/g;

/**
 * Handles, written as a handle or as a profile link.
 *
 * The negative lookbehind keeps email addresses out: the "@" in an address has
 * a word character before it and a handle never does.
 */
const HANDLE = /(?<![\w.])@([A-Za-z0-9._]{2,30})(?![\w.])/g;
const PROFILE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})/gi;

/** Digits only, in the form a dialler wants. */
function telHref(written: string): string {
  const digits = written.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  // 0XX XXX XXXX is the same number as +233 XX XXX XXXX.
  return `tel:+233${digits.replace(/^0/, "")}`;
}

/**
 * Everything tappable in one reply, in the order it was written, without
 * repeats.
 *
 * Deduplicated on the destination rather than on the label, because the same
 * number written once with spaces and once without is one phone call, and a
 * reply naming a venue twice should not offer to ring it twice.
 */
export function linksIn(text: string): ChatLink[] {
  if (!text) return [];

  const found: { at: number; link: ChatLink }[] = [];

  for (const m of text.matchAll(PHONE)) {
    found.push({
      at: m.index ?? 0,
      link: { kind: "phone", label: m[1].trim(), href: telHref(m[1]) },
    });
  }

  for (const m of text.matchAll(PROFILE)) {
    found.push({
      at: m.index ?? 0,
      link: {
        kind: "instagram",
        label: `@${m[1]}`,
        href: `https://instagram.com/${m[1]}`,
      },
    });
  }

  for (const m of text.matchAll(HANDLE)) {
    found.push({
      at: m.index ?? 0,
      link: {
        kind: "instagram",
        label: `@${m[1]}`,
        href: `https://instagram.com/${m[1]}`,
      },
    });
  }

  found.sort((a, b) => a.at - b.at);

  const seen = new Set<string>();
  const out: ChatLink[] = [];
  for (const { link } of found) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    out.push(link);
  }
  // Four is already more than any answer under fifty words should carry, and
  // a wrapped row of chips taller than the reply is not a helpful reply.
  return out.slice(0, 4);
}
