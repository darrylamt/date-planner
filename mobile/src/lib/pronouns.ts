/**
 * MIRRORED from the web app: ../../src/lib/pronouns.ts
 * Pure domain logic with no web dependencies — kept byte-identical so the
 * two clients agree on shapes and formatting. Edit the web copy first,
 * then copy it here.
 */
import type { Pronoun } from "./types";

/**
 * Gender-neutral copy engine.
 * The design's sample screens said "tell us about her" — but a girl can be
 * planning for a boy (or anyone). All partner-facing copy is generated from
 * the pronoun the planner picks, defaulting to "them".
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
