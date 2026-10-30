import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { registerForPush } from "./push";

/*
 * Weekend ideas, new this week and "it's been a while" (the server's
 * nudges.ts, 0100). Promotional, so off until the person turns them on, here
 * or in Profile, and off again whenever they like (App Store 4.5.4). Plan
 * reminders and birthday greetings are not part of it.
 */

const ASKED = "duro.nudges.asked.v1";

/** Whether they are on for this account; null when signed out or not yet available (before 0100). */
export async function nudgesOn(): Promise<boolean | null> {
  try {
    const { data: auth } = await supabase.auth.getSession();
    const user = auth.session?.user;
    if (!user || user.is_anonymous) return null;
    const { data, error } = await supabase.from("notification_prefs").select("nudges").eq("user_id", user.id).maybeSingle();
    if (error) return null;
    return Boolean(data?.nudges);
  } catch {
    return null;
  }
}

/**
 * Turn them on or off. On asks the phone for notifications first, since a
 * nudge needs somewhere to go; a refusal there leaves them off and says so.
 */
export async function setNudges(on: boolean): Promise<{ ok: boolean; message?: string }> {
  try {
    const { data: auth } = await supabase.auth.getSession();
    const user = auth.session?.user;
    if (!user || user.is_anonymous) return { ok: false, message: "Sign in to get these." };
    if (on) {
      const push = await registerForPush();
      if (push === "denied") return { ok: false, message: "Notifications are off for Duro. Turn them on in Settings, then try again." };
      if (push !== "granted") return { ok: false, message: "That did not work on this phone. Try again later." };
    }
    const { error } = await supabase
      .from("notification_prefs")
      .upsert({ user_id: user.id, nudges: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return error ? { ok: false, message: "That did not save. Try again when you have signal." } : { ok: true };
  } catch {
    return { ok: false, message: "That did not save. Try again when you have signal." };
  }
}

/**
 * Asked once on this phone, signed in and not already on: the consent the
 * guideline asks for, in our own words, with the way to undo it named.
 */
export async function askForNudgesOnce(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(ASKED)) return;
    const current = await nudgesOn();
    if (current === null) return; // signed out, or the server is not ready for it
    await AsyncStorage.setItem(ASKED, "1");
    if (current) return;
    Alert.alert(
      "Ideas for the weekend?",
      "What's on in Accra this weekend, what's new on Duro, and a nudge if it's been a while. At most twice a week. You can turn this off in Profile.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Turn on",
          onPress: () =>
            void setNudges(true).then((r) => {
              if (!r.ok && r.message) Alert.alert("Not turned on", r.message);
            }),
        },
      ]
    );
  } catch {
    // Asked another time.
  }
}
