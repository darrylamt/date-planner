import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { Itinerary, PlanInputs } from "./types";

const KEY = "aduro.plan.v1";

export interface Draft {
  inputs?: PlanInputs;
  itinerary?: Itinerary | null;
  shareSlug?: string | null;
  step?: number;
  /**
   * Who built it. Null means it was built signed out, which is the ordinary
   * way in: you plan an evening first and sign in only when you want to save
   * it, so that draft belongs to whoever signs in next.
   */
  userId?: string | null;
}

/**
 * The in-progress plan, kept on the device.
 *
 * This used to be one key with nothing attached to it, and signing out did not
 * clear it. So a plan built on one account was still sitting in storage when a
 * second account signed in on the same phone, and the home screen rendered it:
 * same title, same photograph, same date. Deleting the plan from the first
 * account removed the row from the database and changed nothing on screen,
 * because what the second account was looking at had never come from the
 * server at all.
 *
 * That is a privacy bug rather than a stale card. The draft carries `inputs`,
 * and `inputs` carries the partner's name, the companions' names and the
 * budget.
 *
 * Two defences, because one is not enough. Signing out clears it, and the
 * draft also records who owns it so that a session that changes without going
 * through sign-out, an expired token, a deleted account, a different Apple ID,
 * or the app being killed halfway through, still cannot show one person's
 * evening to another.
 */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;

    const me = await currentUserId();
    /*
     * Someone else's. Cleared rather than merely hidden: leaving it in storage
     * means it reappears the moment they sign out again.
     */
    if (draft.userId && draft.userId !== me) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }

    // Built signed out and now claimed, so it stops being anyone's to inherit.
    if (!draft.userId && me) {
      await AsyncStorage.setItem(KEY, JSON.stringify({ ...draft, userId: me }));
      return { ...draft, userId: me };
    }

    return draft;
  } catch {
    return null;
  }
}

export async function saveDraft(patch: Draft): Promise<void> {
  try {
    const cur = (await loadDraft()) ?? {};
    const merged: Draft = { ...cur, ...patch, userId: await currentUserId() };
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
