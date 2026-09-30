import { nativeOptional } from "./nativeOptional";

/*
 * Loaded defensively: expo-location is native, and a phone on an older binary
 * that receives this bundle over the air has no such module. There the
 * feature is simply absent rather than the screen crashing.
 */
const Location = nativeOptional<typeof import("expo-location")>(() => require("expo-location"));

/** Whether this build can ask for location at all. */
export const locationAvailable = (): boolean => Location != null;

export type Here = { lat: number; lng: number };

/**
 * Where the phone is, asked for only at the moment somebody taps for
 * directions, while the app is open, never in the background.
 *
 * Returned to the caller and not stored: it is sent once to work out the
 * route and forgotten, which is what the permission text promises.
 */
export async function currentPlace(): Promise<Here | "denied" | "unavailable"> {
  if (!Location) return "unavailable";
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return "denied";
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return "unavailable";
  }
}
