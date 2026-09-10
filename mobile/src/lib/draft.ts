import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Itinerary, PlanInputs } from "./types";

const KEY = "aduro.plan.v1";

export interface Draft {
  inputs?: PlanInputs;
  itinerary?: Itinerary | null;
  shareSlug?: string | null;
  step?: number;
}

/**
 * In-progress plans survive backgrounding and app restarts, losing a
 * half-answered questionnaire is the worst thing this app could do.
 */
export async function loadDraft(): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export async function saveDraft(patch: Draft): Promise<void> {
  try {
    const cur = (await loadDraft()) ?? {};
    const merged: Draft = { ...cur, ...patch };
    if (patch.itinerary === null) delete merged.itinerary;
    await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable, the flow still works, it just won't resume */
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
