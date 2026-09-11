import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "aduro.device-id";

/**
 * A per-install identifier, used only to tell reports apart.
 *
 * Not an identity and deliberately not derived from anything about the phone
 * or the person. It exists so that one person tapping "the price has changed"
 * twice is not recorded as two people agreeing, which is the difference
 * between a signal worth acting on and a number anyone can inflate.
 *
 * Random rather than cryptographic on purpose: it guards a count, not a
 * secret, and pulling in a crypto dependency for it would be the wrong trade.
 * Clearing app data yields a new one, which is fine, the cost of that is one
 * duplicate report.
 */
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // Storage unavailable. Fall through and mint a throwaway for this session.
  }

  const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  cached = id;

  try {
    await AsyncStorage.setItem(KEY, id);
  } catch {
    // Not persisted, so the next launch makes another. Still better than
    // sending nothing, which would make every report look like a new device.
  }

  return id;
}
