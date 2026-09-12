import type { Occasion, PlanInputs } from "./types";

/**
 * How a shared plan introduces itself to whoever opens the link.
 *
 * The card was written once, for a couple, and every occasion inherited it:
 * a graduation and a solo day both arrived as AN EVENING FOR TWO with a route
 * underneath. The evening is the same data, but the thing being said about it
 * is not, and a birthday that opens like a date night reads as a mistake by
 * the person who sent it.
 *
 * Copy only. Every figure on the card still comes from the itinerary.
 */
export interface OccasionCard {
  /** Small caps line above the date. */
  eyebrow: string;
  /** One line addressed to the person opening the link. */
  invitation: string;
  /** Sits under the stops, before the totals. */
  closing: string;
  /** Emoji motif, used sparingly as an ornament rather than decoration. */
  motif: string;
}

/** The celebrant's name, when the occasion asked for one. */
function celebrant(inputs: PlanInputs): string {
  const detail = inputs.occasionDetail ?? {};
  return (detail.celebrant ?? "").trim();
}

/** Detail text is typed by a user in lower case and then starts a sentence. */
function sentence(text: string): string {
  const t = text.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function partyWord(size: number): string {
  if (size <= 1) return "you";
  if (size === 2) return "you two";
  return `all ${size} of you`;
}

export function occasionCard(inputs: PlanInputs): OccasionCard {
  const size = inputs.partySize ?? 2;
  const who = celebrant(inputs);
  const detail = inputs.occasionDetail ?? {};

  const cards: Record<Occasion, OccasionCard> = {
    first_date: {
      eyebrow: "A FIRST DATE",
      invitation: "Somewhere easy to talk, with room to leave early or stay late.",
      closing: "No pressure on any of it. The plan is a suggestion, not a schedule.",
      motif: "✦",
    },
    date_night: {
      eyebrow: size === 2 ? "AN EVENING FOR TWO" : `AN EVENING FOR ${size}`,
      invitation: "An evening already worked out, so neither of you has to.",
      closing: "Everything below is booked around the two of you.",
      motif: "❤",
    },
    anniversary: {
      eyebrow: detail.years ? `${detail.years} YEARS` : "AN ANNIVERSARY",
      invitation: detail.tradition
        ? `Built around ${detail.tradition.trim()}.`
        : "The same evening you would have chosen, without having to choose it.",
      closing: "Here is to the next one.",
      motif: "❦",
    },
    birthday: {
      eyebrow: who ? `${who.toUpperCase()}'S BIRTHDAY` : "A BIRTHDAY",
      invitation: who
        ? `The whole day is pointed at ${who}.`
        : `The whole day is pointed at the birthday.`,
      closing: detail.age
        ? `${detail.age}, and marked properly.`
        : "Marked properly, rather than squeezed in after work.",
      motif: "🎂",
    },
    graduation: {
      eyebrow: "A GRADUATION",
      invitation: detail.programme
        ? `${sentence(detail.programme)}, finished. This is the evening for it.`
        : "Finished, and worth more than a message saying congratulations.",
      closing: "Earned, every bit of it.",
      motif: "✧",
    },
    celebration: {
      eyebrow: "A CELEBRATION",
      invitation: detail.reason
        ? `For ${detail.reason.trim()}.`
        : "For the good news, whatever shape it took.",
      closing: "Some things deserve more than a text about them.",
      motif: "✶",
    },
    friend_outing: {
      eyebrow: size > 2 ? `A DAY FOR ${size}` : "A DAY WITH FRIENDS",
      invitation: `Somewhere good, sorted out in advance, for ${partyWord(size)}.`,
      closing: "No candles, no speeches. Just a decent day out.",
      motif: "✳",
    },
    solo_day: {
      eyebrow: "A DAY TO YOURSELF",
      invitation: detail.intent
        ? `${sentence(detail.intent)}, with the deciding already done.`
        : "A day off from deciding where to go.",
      closing: "Yours, entirely.",
      motif: "◈",
    },
  };

  return cards[inputs.occasion] ?? cards.date_night;
}
