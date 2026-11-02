import * as Updates from "expo-updates";
import { supabase } from "./supabase";

/**
 * The redesign, tried on one phone (owner, 2 Nov 2026: "rebuild the app...
 * without touching what users are seeing currently").
 *
 * The rebuilt app is published to its own channel, "redesign", from its own
 * copy of the code (the redesign branch, in date-planner-redesign). This phone
 * asks that channel for updates instead of production, and nobody else's does.
 * The choice is kept on the phone until it is switched back, or the app is
 * deleted and reinstalled. Both apps talk to the same server and data.
 *
 * An update reaches only builds with the same runtime version, so once the
 * redesign needs native code the App Store build lacks, it moves to a new
 * runtime and this phone needs the TestFlight build that has it (the
 * "redesign" profile in eas.json).
 *
 * In this copy: whatever replaces Profile must keep a way back to the current
 * app. The crash screen keeps one too.
 */
export const REDESIGN_CHANNEL = "redesign";

/** Whether this launch is running the redesign. */
export function onRedesign(): boolean {
  return Updates.channel === REDESIGN_CHANNEL;
}

/** Admin accounts only, and only a real build: development and Expo Go have no channel to change. */
export async function mayTryRedesign(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { data: row } = await supabase.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
  return Boolean((row as { is_admin?: boolean } | null)?.is_admin);
}

/**
 * Move this phone to the redesign, or back, and restart into it. Answers with
 * what to tell them when it cannot; on success the app restarts and there is
 * nobody left to tell.
 */
export async function switchApp(to: "redesign" | "current"): Promise<string | null> {
  Updates.setUpdateRequestHeadersOverride(to === "redesign" ? { "expo-channel-name": REDESIGN_CHANNEL } : null);
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
    } else if (to === "redesign") {
      // Nothing published there yet: stay as we are rather than restart into the same app.
      Updates.setUpdateRequestHeadersOverride(null);
      return "Nothing has been published to the redesign yet.";
    }
    await Updates.reloadAsync();
    return null;
  } catch (e) {
    console.warn("switch app", (e as { message?: string } | null)?.message);
    if (to === "redesign") Updates.setUpdateRequestHeadersOverride(null);
    return "That didn't go through. Check your connection and try again.";
  }
}
