import { Platform } from "react-native";
import Constants from "expo-constants";
import { nativeOptional } from "./nativeOptional";
import { supabase } from "./supabase";

/**
 * Registering this device to be told about its own plans.
 *
 * ── why this is not called on launch ────────────────────────────────────
 * iOS lets you ask for notification permission exactly once. Ask on first
 * open, before anybody has a plan to be reminded about, and most people say no
 * to a question they have no reason to answer yet, and the decision is final
 * until they go and find it in Settings.
 *
 * So the ask is deferred to the moment it explains itself: somebody has just
 * saved a plan for a date in the future, and a reminder the night before is
 * obviously for them. That is the only place this is called from.
 *
 * ── and why the module is optional ──────────────────────────────────────
 * expo-notifications is native, and native code does not ship over the air. A
 * build already on somebody's phone will receive this JavaScript and not the
 * module it needs, so importing it directly would throw on the first render of
 * whichever screen touched it. nativeOptional turns that into null, the
 * feature quietly does not exist on older builds, and the rest of the app is
 * untouched.
 */
const Notifications = nativeOptional<typeof import("expo-notifications")>(() =>
  require("expo-notifications")
);
const Device = nativeOptional<typeof import("expo-device")>(() => require("expo-device"));

/** Whether this build can do notifications at all. */
export function pushAvailable(): boolean {
  return Notifications !== null;
}

/**
 * Ask, then store the token.
 *
 * Returns what happened rather than a boolean, because the three outcomes need
 * different handling by the caller: granted is worth a word, denied must never
 * be asked about again, and unavailable is an older build rather than a
 * refusal and should say nothing at all.
 */
export type PushOutcome = "granted" | "denied" | "unavailable" | "failed";

export async function registerForPush(): Promise<PushOutcome> {
  if (!Notifications) return "unavailable";

  // A simulator has no push certificate and will throw rather than return a
  // token, which is a confusing crash to hit while testing something else.
  if (Device && !Device.isDevice) return "unavailable";

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    /*
     * Only ask when iOS would actually show the dialog. Calling request on a
     * denied permission silently resolves denied without prompting, so asking
     * again is not a second chance, it is a wasted round trip.
     */
    if (status !== "granted" && existing.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return "denied";

    /*
     * The project id has to be passed explicitly in a bare workflow build.
     * Without it getExpoPushTokenAsync throws at runtime with a message about
     * a missing experience id, which is a thing to discover in TestFlight
     * rather than here.
     */
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (!token) return "failed";

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "failed";

    /*
     * Upsert on the token, because Expo rotates them: the same device can come
     * back with a different one after an update, and the same token can come
     * back on every launch. Keyed on the token, a repeat is a no-op instead of
     * a duplicate that sends somebody two of everything.
     */
    const { error } = await supabase.from("push_tokens").upsert(
      {
        token,
        user_id: user.id,
        platform: Platform.OS === "ios" ? "ios" : "android",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    );

    return error ? "failed" : "granted";
  } catch {
    // A device that will not give a token is not a reason to interrupt
    // somebody who has just saved a plan.
    return "failed";
  }
}

/**
 * How a notification behaves while the app is open.
 *
 * Set once, at the root. Without it a reminder that arrives while somebody is
 * looking at the app does nothing at all, which reads as a notification that
 * failed rather than one that was politely suppressed.
 */
export function configureNotificationHandler(): void {
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Take somebody to the plan a reminder was about.
 *
 * Two cases, and both matter. A tap while the app is running arrives on the
 * response listener; a tap that launched the app from cold has already
 * happened by the time this runs, and only getLastNotificationResponseAsync
 * knows about it. Handling just the first is how a notification works
 * perfectly in testing and does nothing for a phone that was asleep.
 *
 * Returns its own unsubscribe, so the caller's effect can clean up.
 */
export function subscribeToNotificationTaps(open: (url: string) => void): () => void {
  if (!Notifications) return () => {};

  const urlFrom = (response: unknown): string | null => {
    const data = (response as { notification?: { request?: { content?: { data?: unknown } } } })
      ?.notification?.request?.content?.data as { url?: unknown } | undefined;
    /*
     * Only ever a path on this app. The payload is ours, but it arrives from
     * the network, and a push that could hand an arbitrary string to the
     * router is a push that could send somebody anywhere.
     */
    return typeof data?.url === "string" && data.url.startsWith("/") ? data.url : null;
  };

  // Cold start: the tap that opened the app happened before this listener.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    const url = response ? urlFrom(response) : null;
    if (url) open(url);
  });

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const url = urlFrom(response);
    if (url) open(url);
  });

  return () => sub.remove();
}
