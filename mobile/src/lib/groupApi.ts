import { supabase } from "./supabase";
import { ensureSession } from "./useAuth";
import type {
  GroupAnswer,
  GroupMe,
  GroupOccasion,
  GroupOrganiserView,
  GroupPublic,
  GroupSummary,
  Slot,
} from "./groups";

/**
 * The app's side of group outings: every call to /api/groups/*.
 *
 * Signed in, the app sends its bearer token and the server knows the member
 * by account. Answering from the app makes an anonymous session if there is
 * none, so a friend who opens the link in the app never has to sign up.
 * Starting a group needs a real account; the server says so with a 403.
 */
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export const groupLink = (code: string) => `${BASE}/g/${code}`;

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, status: res.status, error: json.error ?? "unavailable" };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, error: "offline" };
  }
}

export function createGroup(input: {
  occasion: GroupOccasion;
  title?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Chosen days instead of a range. */
  days?: string[];
  areaHintId?: string | null;
  deadline: string;
  expected?: number;
  organiserName: string;
}) {
  return call<{ code: string }>("POST", "/api/groups", input);
}

export const myGroups = () => call<{ groups: GroupSummary[] }>("GET", "/api/groups");
export const getGroup = (code: string) => call<GroupPublic>("GET", `/api/groups/${code}`);
export const getMe = (code: string) => call<GroupMe>("GET", `/api/groups/${code}/me`);
export const organiserView = (code: string) => call<GroupOrganiserView>("GET", `/api/groups/${code}/organiser`);
export const cancelGroup = (code: string) => call<{ ok: true }>("DELETE", `/api/groups/${code}`);
export const removeMember = (code: string, id: string) => call<{ ok: true }>("DELETE", `/api/groups/${code}/members/${id}`);
export const lockGroup = (code: string, planId: string) => call<{ slug: string }>("POST", `/api/groups/${code}/lock`, { planId });

export async function answerGroup(code: string, answer: GroupAnswer) {
  // A friend answering in the app needs some session for the server to know them by.
  await ensureSession();
  return call<{ memberId: string }>("PUT", `/api/groups/${code}/answer`, answer);
}

export type Recommendation =
  | { status: "ok"; proposal: NonNullable<GroupOrganiserView["proposal"]> }
  | { status: "not_enough" }
  | { status: "no_match"; headline: string; message: string };

export const recommend = (code: string, opts: { date?: string; slot?: Slot; ai?: boolean } = {}) =>
  call<Recommendation>("POST", `/api/groups/${code}/recommend`, opts);
