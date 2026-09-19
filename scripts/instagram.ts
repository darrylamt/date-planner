/**
 * Does an Instagram account exist, and whose is it?
 *
 * Shared by research-check and research-apply. It lives in one file because
 * both need it and the two details below are the kind that get "tidied up"
 * into a broken state if there are two copies to tidy.
 *
 * ── why curl and not fetch ──────────────────────────────────────────────
 * Node's own fetch gets the logged-out app shell for every handle: a 627KB
 * page titled "Instagram", byte-identical whether the account is real or was
 * invented on the spot. A checker built on it reports that every handle in
 * the batch is fake, which is what the first version of this did to 23 good
 * rows.
 *
 * ── why the user agent is short ─────────────────────────────────────────
 * It must stay short. A string containing a Chrome version gets that same
 * app shell; without one, Instagram serves the server-rendered profile whose
 * <title> carries the account's display name. Making this look "more like a
 * real browser" silently restores the failure above.
 */
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

/** Short on purpose. See the note above before changing it. */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export interface Profile {
  /** true, false, or null for "could not tell" — never false on an error. */
  exists: boolean | null;
  /** What the account calls itself, which is the only check for ownership. */
  displayName?: string;
}

export async function instagramProfile(handle: string): Promise<Profile> {
  const bare = handle.replace(/^@/, "").trim();
  if (!bare) return { exists: null };

  try {
    const { stdout } = await execFile(
      "curl",
      ["-s", "--max-time", "25", "-A", UA, `https://www.instagram.com/${bare}/`],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    const title = stdout.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
    const decoded = title
      .replace(/&#064;/g, "@")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .trim();

    // An empty title means the page never arrived. Unknown, not absent.
    if (!decoded) return { exists: null };
    if (decoded.toLowerCase() === "instagram") return { exists: false };
    return { exists: true, displayName: decoded.split("(")[0].trim() || decoded };
  } catch {
    // No curl, no network, a timeout. Unknown, never "fake".
    return { exists: null };
  }
}

/**
 * The same question, retried once.
 *
 * Instagram times out often enough that a single attempt turns a real account
 * into "could not be checked", and a batch full of those is a batch nobody
 * reads. Only the unknown answer is retried: a definite yes or no is already
 * an answer.
 */
export async function instagramProfileTwice(handle: string): Promise<Profile> {
  const first = await instagramProfile(handle);
  if (first.exists !== null) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return instagramProfile(handle);
}
