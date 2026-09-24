import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Whether this person has agreed to their words being sent to Anthropic.
 *
 * App Store guideline 5.1.2(i), as tightened in late 2025: an app must
 * clearly disclose where personal data is shared with third parties,
 * "including with third-party AI", and obtain explicit permission before
 * doing so. Both the assistant and the plan description send what somebody
 * typed -- a partner's name, what they like, whose birthday it is -- to
 * Anthropic's API, and nothing said so anywhere but the privacy page.
 *
 * Kept on the device rather than the account because it has to be answered
 * before there is necessarily an account, and it is a question about this
 * person's choice, not about a row.
 */
const KEY = "aduro.aiConsent.v1";

export type AiConsent = "granted" | "declined" | null;

export async function getAiConsent(): Promise<AiConsent> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === "granted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

export async function setAiConsent(value: "granted" | "declined"): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, value);
  } catch {
    // Unsaved means asked again next time, which is the safe direction.
  }
}
