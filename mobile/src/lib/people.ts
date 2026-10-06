import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The names last used on the bill tools, so the same group out again next
 * Friday does not type themselves in twice. On this phone only: these are
 * somebody's friends, and nothing about them needs to leave it.
 */
const NAMES_KEY = "duro.people.names";
const MOMO_KEY = "duro.people.momo";

export async function rememberedNames(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(NAMES_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}

export async function rememberNames(names: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, 12)));
  } catch {
    /* Nothing lost but convenience. */
  }
}

/** The mobile money number they ask to be paid on. */
export async function rememberedMomo(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(MOMO_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function rememberMomo(number: string): Promise<void> {
  try {
    await AsyncStorage.setItem(MOMO_KEY, number);
  } catch {
    /* Fine. */
  }
}

/** Whether a name on the list is the person holding the phone. */
export const isMe = (name: string | undefined) => /^me$/i.test((name ?? "").trim());

/**
 * A starting list for `count` people: the remembered names first, then
 * "Friend 2", "Friend 3"… so the list is never empty and "Me" is always one.
 */
export function startingNames(remembered: string[], count: number): string[] {
  const want = Math.max(2, Math.min(12, count));
  const out = remembered.length ? remembered.slice(0, 12) : ["Me"];
  for (let i = out.length; i < want; i++) out.push(`Friend ${i + 1}`);
  return out;
}
