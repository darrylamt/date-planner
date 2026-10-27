import { useEffect, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Button } from "../Button";
import { useTheme } from "../../lib/useTheme";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { record } from "../../lib/usage";

const key = (slug: string) => `duro.went.${slug}`;

/**
 * "Did you go?", on a saved plan once its day has passed (usage_events, 0097).
 *
 * The one answer that turns a plan into a visit: what Duro! actually sent a
 * venue, and whether the plan was any good. Asked once per plan on this phone,
 * gone for good once answered, and nothing more than three taps' worth.
 * The evening-after reminder opens the plan here.
 */
export function WentCard({ slug, date, firstStop, occasion }: { slug: string; date: string; firstStop?: string; occasion: string }) {
  const c = useTheme();
  const [state, setState] = useState<"hidden" | "ask" | "thanks">("hidden");
  const past = date < new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!past) return;
    let active = true;
    AsyncStorage.getItem(key(slug))
      .then((v) => active && !v && setState("ask"))
      .catch(() => active && setState("ask"));
    return () => {
      active = false;
    };
  }, [slug, past]);

  if (state === "hidden") return null;

  const answer = (value: 0 | 1 | 2, word: string) => {
    void Haptics.selectionAsync();
    record("went", { name: slug, value, data: { answer: word, occasion } });
    void AsyncStorage.setItem(key(slug), word).catch(() => undefined);
    setState("thanks");
  };

  return (
    <View
      style={{
        marginHorizontal: GUTTER,
        marginBottom: space.lg,
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
          Thanks. That helps us plan the next one better.
        </Text>
      ) : (
        <>
          <Text variant="headline">{firstStop ? `Did you make it to ${firstStop}?` : "Did you go?"}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Button title="Yes, we went" size="medium" onPress={() => answer(1, "went")} />
            <Button title="Plans changed" size="medium" kind="gray" onPress={() => answer(2, "changed")} />
            <Button title="We didn't go" size="medium" kind="gray" onPress={() => answer(0, "no")} />
          </View>
        </>
      )}
    </View>
  );
}
