import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Symbol } from "./Symbol";
import { useTheme } from "../lib/useTheme";
import { GUTTER, HAIRLINE, radius, space } from "../theme";
import { record } from "../lib/usage";

const KEY = "duro.heard-from";

const CHANNELS: { id: string; label: string }[] = [
  { id: "friend", label: "A friend" },
  { id: "shared_plan", label: "Someone sent me a plan" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "x", label: "X" },
  { id: "app_store", label: "Searching the store" },
  { id: "google", label: "Google" },
  { id: "other", label: "Somewhere else" },
];

/**
 * "How did you hear about Duro!?", asked once on Home (usage_events, 0097).
 *
 * Phones do not say where an install came from, so we ask, once, in one tap,
 * and never again whether it is answered or closed. Not on a first visit,
 * which has enough to take in already.
 */
export function HeardFromCard() {
  const c = useTheme();
  const [state, setState] = useState<"hidden" | "ask" | "thanks">("hidden");

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY)
      .then((v) => active && !v && setState("ask"))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (state === "hidden") return null;

  const done = (id: string | null) => {
    void AsyncStorage.setItem(KEY, id ?? "closed").catch(() => undefined);
    if (!id) return setState("hidden");
    void Haptics.selectionAsync();
    record("heard_from", { name: id });
    setState("thanks");
  };

  return (
    <View
      style={{
        marginHorizontal: GUTTER,
        marginTop: space.lg,
        padding: space.lg,
        gap: space.md,
        borderRadius: radius.card,
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
      }}
    >
      {state === "thanks" ? (
        <Text variant="body" tone="secondary">
          Thank you. It tells us where to find more people like you.
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
            <Text variant="headline" style={{ flex: 1 }}>
              How did you hear about Duro!?
            </Text>
            <Pressable onPress={() => done(null)} hitSlop={12} accessibilityLabel="Close">
              <Symbol name="xmark" size={14} color={c.textSecondary} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {CHANNELS.map((ch) => (
              <Pressable
                key={ch.id}
                onPress={() => done(ch.id)}
                style={({ pressed }) => ({
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                  borderRadius: radius.pill,
                  borderWidth: HAIRLINE,
                  borderColor: c.border,
                  backgroundColor: pressed ? c.backgroundSunken : c.background,
                })}
              >
                <Text variant="footnote" weight="600">
                  {ch.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
