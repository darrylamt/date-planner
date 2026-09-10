import type { Gender, Pronoun } from "./types";

/**
 * Copy engine.
 *
 * Nobody is asked to pick a pronoun any more — that question read as a form to
 * fill in rather than a question about someone you like. For a pair we ask a
 * plain "is it a him or a her?", with skipping it a first-class answer, and
 * everything else is derived. Groups and solo outings never see it at all.
 */
export interface PronounSet {
  them: string; // tell us about ___
  their: string; // ___ evening
  they: string; // ___ loves
  theyLl: string; // ___'ll know every song
}

const SETS: Record<Pronoun, PronounSet> = {
  they: { them: "them", their: "their", they: "they", theyLl: "they'll" },
  she: { them: "her", their: "her", they: "she", theyLl: "she'll" },
  he: { them: "him", their: "his", they: "he", theyLl: "he'll" },
};

export function pronounSet(p: Pronoun): PronounSet {
  return SETS[p] ?? SETS.they;
}

/** Unspecified stays "they", which is a real answer and not a fallback. */
export function pronounForGender(gender: Gender | undefined): Pronoun {
  if (gender === "female") return "she";
  if (gender === "male") return "he";
  return "they";
}

/** "Kofi's evening" / "their evening" */
export function possessiveName(name: string, p: Pronoun): string {
  const n = name.trim();
  if (n) return `${n}'s`;
  return pronounSet(p).their;
}

/** "about Kofi" / "about him" */
export function aboutName(name: string, p: Pronoun): string {
  const n = name.trim();
  if (n) return n;
  return pronounSet(p).them;
}
