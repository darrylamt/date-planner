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

export type SwapResponse =
  | { status: "ok"; itinerary: Itinerary }
  | { status: "no_match"; message: string }
  | { status: "error"; message: string };

export async function swapStop(
  inputs: PlanInputs,
  itinerary: Itinerary,
  stopIndex: number
): Promise<SwapResponse> {
  try {
    return await postJson<SwapResponse>("/api/swap", { inputs, itinerary, stopIndex });
  } catch {
    return { status: "error", message: "Couldn't find a good swap — your plan is untouched." };
  }
}
