import type { GenerateResponse, Itinerary, PlanInputs } from "./types";

/**
 * The planner endpoints live on the deployed web app because they hold the
 * server-side Anthropic key. Native fetch is not subject to CORS, so these
 * are the same routes the website calls, unchanged.
 */
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

if (!BASE) {
  console.warn("EXPO_PUBLIC_API_URL is unset — plan generation will fail.");
}

/** Generation can take a while; fail loudly rather than hanging forever. */
const TIMEOUT_MS = 90_000;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // The routes return structured JSON on failure too, so parse either way.
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function generatePlan(inputs: PlanInputs): Promise<GenerateResponse> {
  try {
    return await postJson<GenerateResponse>("/api/generate", inputs);
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return {
      status: "error",
      message: aborted
        ? "That took too long. Your answers are safe — try again."
        : "We couldn't reach the planner. Check your connection and try again.",
    };
  }
}


/** What can be reported about a venue, in the order the sheet offers them. */
export type ReportType = "price" | "closed" | "phone" | "wrong_info" | "other";

/**
 * Tell us something is wrong with a venue.
 *
 * Deliberately forgiving: a report is a courtesy, not a transaction, so a
 * failure here is swallowed into a soft result rather than thrown. Losing one
 * report matters far less than interrupting someone mid-evening with an error
 * about a tap they made in passing.
 */
export async function reportVenue(input: {
  venueId: string;
  reportType: ReportType;
  suggestedPriceGhs?: number | null;
  note?: string;
}): Promise<{ ok: boolean; duplicate: boolean }> {
  try {
    const { deviceId } = await import("./deviceId");
    const res = await postJson<{ ok: boolean; duplicate?: boolean }>("/api/reports", {
      ...input,
      deviceId: await deviceId(),
    });
    return { ok: Boolean(res.ok), duplicate: Boolean(res.duplicate) };
  } catch {
    return { ok: false, duplicate: false };
  }
}
