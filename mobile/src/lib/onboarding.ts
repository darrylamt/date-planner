import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "aduro.onboarded.v1";

/**
 * Whether the intro has been seen. Versioned in the key so a future rewrite
 * can be shown again without stranding people who already onboarded.
 *
 * Reads default to TRUE on failure: a storage error should skip the intro, not
 * trap someone in it on every launch.
 */
export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    return true;
  }
}

export async function markOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    /* Worst case it shows once more. */
  }
}

/** Used by the You tab, so the intro can be replayed deliberately. */
export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
