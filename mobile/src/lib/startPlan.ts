import { Alert } from "react-native";
import { router } from "expo-router";
import { loadDraft } from "./draft";
import type { PlanEntry, PlanInputs } from "./types";

/**
 * Starts a NEW plan from anywhere.
 *
 * Shared by the + button and the occasion cards so the confirmation cannot
 * drift between them. Resuming is the In progress card's job and nothing
 * else's, when every entry point resumed, a finished plan made it impossible
 * to start another.
 */
export async function startNewPlan(occasion?: PlanInputs["occasion"], entry?: PlanEntry): Promise<void> {
  // entry says which door this was (0085), so the Home redesign can be judged by use.
  const from = entry ? `&from=${entry}` : "";
  const href = occasion
    ? `/plan/new?fresh=1&occasion=${occasion}${from}`
    : `/plan/new?fresh=1${from}`;

  const draft = await loadDraft();
  // A saved plan is kept in Saved, so starting another loses nothing and
  // warning about it only teaches people to ignore the warning.
  const hasWork = Boolean(draft?.inputs && !draft.shareSlug && (draft.itinerary || draft.step));

  if (!hasWork) {
    router.push(href);
    return;
  }

  // Replacing real work should never be silent.
  Alert.alert(
    "Start a new plan?",
    draft?.itinerary
      ? "Your current plan will be replaced. Save or share it first if you want to keep it."
      : "Your answers so far will be discarded.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Start new", style: "destructive", onPress: () => router.push(href) },
    ]
  );
}
