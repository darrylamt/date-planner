import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "aduro.device-id";

/**
 * A stable per-install identifier.
 *
 * Not an identity and not a login, it exists so that one person tapping
 * "report" twice does not read as two people agreeing. That count is what an
 * admin uses to decide whether a report is worth acting on, so it has to mean
 * what it looks like it means.
 *
 * Deliberately not derived from anything about the device or the person. It is
 * a random string that lives in this app's storage and goes away with it.
 */
let cached: string | null = null;

export async function deviceId(): Promise<string> {
  if (cached) return cached;

  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // Storage unavailable, fall through and mint a per-session id rather
    // than failing the report the user is trying to send.
  }

  const minted = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  cached = minted;
  try {
    await AsyncStorage.setItem(KEY, minted);
  } catch {
    // Same again: an unsaved id still de-duplicates within this session.
  }
  return minted;
}
