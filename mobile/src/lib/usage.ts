import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { supabase } from "./supabase";
import { getDeviceId } from "./deviceId";

/**
 * What the app does between plans, sent to /api/usage (usage_events, 0097):
 * a day's first open, each planner question reached, Venues tab searches and
 * what was opened from them, "Did you go?" and how somebody heard of Duro!.
 *
 * The same arrangement as signals.ts: queued, sent in batches a few seconds
 * after the last one or when the app goes to the background, never throws and
 * never shows anything. A lost event costs nothing on screen.
 */
export type UsageKind = "app_open" | "step_viewed" | "search" | "venue_opened" | "went" | "heard_from";
type Data = Record<string, string | number | boolean>;
type Pending = { kind: UsageKind; name?: string; value?: number; data?: Data; at: string };

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Lower-case words only, as the server takes them: "venues_tab", "first_date". */
const clean = (data?: Data): Data | undefined => {
  if (!data) return undefined;
  const out: Data = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") {
      const w = v.toLowerCase().replace(/[^a-z0-9_:.-]/g, "_").slice(0, 64);
      if (w) out[k] = w;
    } else if (typeof v === "boolean" || Number.isInteger(v)) out[k] = v;
  }
  return out;
};

export function record(kind: UsageKind, extra: { name?: string; value?: number; data?: Data } = {}) {
  if (!BASE) return;
  queue.push({ kind, ...extra, data: clean(extra.data), at: new Date().toISOString() });
  if (queue.length >= 20) void flush();
  else {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), 4000);
  }
}

const OPEN_KEY = "duro.last-open-day";

/** Once a day per phone, for how many come back. The server also refuses a second one. */
export async function recordOpen() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if ((await AsyncStorage.getItem(OPEN_KEY)) === today) return;
    await AsyncStorage.setItem(OPEN_KEY, today);
  } catch {
    // Storage unavailable: send anyway, the database keeps it to one a day.
  }
  record("app_open");
  void flush();
}

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const events = queue.splice(0, 40);
  try {
    const [{ data }, deviceId] = await Promise.all([supabase.auth.getSession(), getDeviceId()]);
    const token = data.session?.access_token;
    await fetch(`${BASE}/api/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        deviceId,
        platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
        appVersion: Constants.expoConfig?.version ?? undefined,
        events,
      }),
    });
  } catch {
    // Dropped: nothing on screen depends on it.
  }
  if (queue.length) void flush();
}

AppState.addEventListener("change", (s) => {
  if (s !== "active") void flush();
  else void recordOpen();
});
