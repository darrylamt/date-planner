import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";

/**
 * The Durobot button in the tab bar. Native tabs need a screen behind every
 * item, but this one is never selected: the tap opens the chat (see the tabs
 * layout). Should a link ever land here, it goes home and opens the chat.
 */
export default function DurobotTab() {
  useFocusEffect(
    useCallback(() => {
      router.replace("/");
      router.push("/chat");
    }, [])
  );
  return null;
}
