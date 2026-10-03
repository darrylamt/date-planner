import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { nativeOptional } from "./nativeOptional";

/*
 * Talking to Durobot, from build 24. expo-speech-recognition asks for its
 * native half the moment it is imported, so it is looked for first; on an
 * older build there is no mic button, and typing is unchanged.
 */
type SpeechModule = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;
const Speech: SpeechModule | null =
  Platform.OS === "ios" && requireOptionalNativeModule("ExpoSpeechRecognition")
    ? nativeOptional(() => (require("expo-speech-recognition") as typeof import("expo-speech-recognition")).ExpoSpeechRecognitionModule)
    : null;

export const voiceAvailable = (): boolean => Speech != null;

/**
 * Listen while the mic is held, and hand over the words as they come.
 *
 * Apple's recogniser does the listening, and what reaches Duro is the text,
 * never the audio. British English, the nearest Apple offers to how Accra
 * speaks; punctuation on, so a question arrives as one. Resolves to the
 * function that stops listening, or null when it could not start (no
 * permission, or no module), having said why through onError.
 */
export async function startListening(on: {
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}): Promise<(() => void) | null> {
  if (!Speech) return null;
  const perm = await Speech.requestPermissionsAsync().catch(() => null);
  if (!perm?.granted) {
    on.onError("Duro needs the microphone and speech recognition for this. Turn them on in Settings, under Duro.");
    return null;
  }

  const subs: { remove(): void }[] = [];
  const done = () => {
    subs.forEach((s) => s.remove());
    subs.length = 0;
  };
  subs.push(
    Speech.addListener("result", (e) => on.onText(e.results[0]?.transcript ?? "")),
    Speech.addListener("end", () => {
      done();
      on.onEnd();
    }),
    Speech.addListener("error", (e) => {
      // Letting go before saying anything is not a failure worth a message.
      if (e.error !== "aborted" && e.error !== "no-speech") on.onError("Durobot could not hear that. Try again, or type it.");
    })
  );

  try {
    Speech.start({ lang: "en-GB", interimResults: true, addsPunctuation: true, continuous: true });
  } catch {
    done();
    on.onError("Durobot could not start listening. Try again, or type it.");
    return null;
  }
  return () => Speech.stop();
}
