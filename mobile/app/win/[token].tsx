import { useEffect } from "react";
import { Linking, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { GUTTER, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { SITE_URL } from "../../src/lib/site";

/*
 * Where the "You won!" push lands (0117): the ticket itself is a web page,
 * so this opens it, and stays as a way back to it.
 */
export default function WinnerTicket() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const c = useTheme();
  const ok = typeof token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(token);
  const url = ok ? `${SITE_URL}/win/${token}` : null;

  useEffect(() => {
    if (url) void Linking.openURL(url).catch(() => undefined);
  }, [url]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background, padding: GUTTER, justifyContent: "center", gap: space.md }}>
      <Stack.Screen options={{ title: "Your ticket" }} />
      <Text variant="largeTitle" style={{ textAlign: "center" }}>
        You won! 🎉
      </Text>
      <Text variant="body" tone="secondary" style={{ textAlign: "center" }}>
        Your ticket opens in your browser. Screenshot it or save it: it gets scanned at the gate.
      </Text>
      {url ? <Button title="Open my ticket" icon="ticket.fill" onPress={() => void Linking.openURL(url)} /> : null}
      <Button title="Back to Duro!" kind="gray" onPress={() => router.replace("/")} />
    </View>
  );
}
