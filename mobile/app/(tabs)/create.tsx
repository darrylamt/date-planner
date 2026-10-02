import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";

/**
 * The New plan button in the tab bar. Native tabs need a screen behind every
 * item, but this one is never selected: the tap is refused and opens the
 * planner (see the tabs layout). Should a link ever land here, it goes home.
 */
export default function CreateTab() {
  useFocusEffect(
    useCallback(() => {
      router.replace("/");
    }, [])
  );
  return null;
}
