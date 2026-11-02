/**
 * GENERATED, do not edit. Mirrored from src/lib/fold.ts.
 *
 * Run `npm run mirror` after changing the web copy.
 */
/**
 * Text as a search compares it: lower case, without accents (owner, 2 Nov
 * 2026: a search with "a" must still find "à"). "À La Lune", "Crème brûlée",
 * "Café" and "Pâte à choux" are found by "a la lune", "creme brulee", "cafe"
 * and "pate a choux", and the other way round. Mirrored to mobile/src/lib.
 *
 * A table rather than String.normalize, so the answer is the same in a
 * browser, in Hermes on a phone and on the server.
 */
const PLAIN: Record<string, string> = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", ā: "a", ă: "a", ą: "a", æ: "ae",
  ç: "c", ć: "c", č: "c",
  è: "e", é: "e", ê: "e", ë: "e", ē: "e", ė: "e", ę: "e", ě: "e", ɛ: "e",
  ì: "i", í: "i", î: "i", ï: "i", ī: "i", į: "i",
  ñ: "n", ń: "n", ň: "n", ŋ: "n",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ø: "o", ō: "o", œ: "oe", ɔ: "o",
  ù: "u", ú: "u", û: "u", ü: "u", ū: "u", ů: "u",
  ý: "y", ÿ: "y",
  ß: "ss", ś: "s", š: "s", ź: "z", ż: "z", ž: "z", ł: "l", ř: "r", ť: "t", ď: "d",
  "’": "'", "‘": "'",
};

export function fold(text: string | null | undefined): string {
  // Accents typed as a letter plus a combining mark go too.
  const lower = String(text ?? "").toLowerCase().replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of lower) out += PLAIN[ch] ?? ch;
  return out;
}

/** Whether `text` contains `query`, accents and case aside. */
export function foldIncludes(text: string | null | undefined, query: string): boolean {
  return fold(text).includes(fold(query));
}

/**
 * A database pattern (ilike) that finds a name however it is accented: every
 * letter that has accented forms becomes a one-character wildcard. It finds
 * more than it should ("c_f_" is "cafe" and "cofe"), so the rows it returns
 * are kept only where foldIncludes agrees.
 */
export function accentPattern(query: string): string {
  const plain = fold(query.trim()).replace(/[\\%_]/g, (c) => `\\${c}`);
  // Only the letters that carry accents here: widening every letter matched nearly every dish.
  return `%${plain.replace(/[aceinouy]/g, "_")}%`;
}
