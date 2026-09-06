import { useCallback, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Group, Row } from "../../src/components/List";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth, signOut } from "../../src/lib/useAuth";
import { clearDraft, loadDraft } from "../../src/lib/draft";

const TAB_BAR_CLEARANCE = 96;

export default function Profile() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [hasDraft, setHasDraft] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadDraft().then((d) => active && setHasDraft(Boolean(d?.inputs)));
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.groupedBackground }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: TAB_BAR_CLEARANCE,
      }}
    >
      <Text variant="largeTitle" style={{ paddingHorizontal: GUTTER, marginBottom: space.xl }}>
        You
      </Text>

      {session ? (
        <Group header="Account" footer="Saved plans are tied to this address.">
          <Row icon="envelope.fill" title={session.user.email ?? "Signed in"} />
        </Group>
      ) : (
        <View style={{ paddingHorizontal: GUTTER, marginBottom: space.xxl }}>
          <View
            style={{
              backgroundColor: c.surface,
              borderRadius: 12,
              padding: space.xl,
              alignItems: "center",
            }}
          >
            <Symbol name="person.crop.circle" size={40} color={c.secondaryLabel} />
            <Text variant="headline" center style={{ marginTop: space.md }}>
              Sign in to save plans
            </Text>
            <Text
              variant="footnote"
              tone="secondary"
              center
              style={{ marginTop: space.xs, marginBottom: space.lg }}
            >
              You can plan without an account — signing in lets you keep plans and
              share them.
            </Text>
            <Button title="Sign in" onPress={() => router.push("/login")} />
          </View>
        </View>
      )}

      <Group header="This device">
        <Row
          icon="trash"
          iconColor={c.red}
          title="Clear in-progress plan"
          subtitle={hasDraft ? "A saved draft is on this device" : "Nothing in progress"}
          destructive
          disabled={!hasDraft}
          onPress={() =>
            Alert.alert(
              "Clear in-progress plan?",
              "Your answers on this device will be discarded. Saved plans are not affected.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: async () => {
                    await clearDraft();
                    setHasDraft(false);
                  },
                },
              ]
            )
          }
        />
      </Group>

      {session ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <Button title="Sign out" kind="gray" onPress={() => void signOut()} />
        </View>
      ) : null}

      <Text
        variant="caption1"
        tone="tertiary"
        center
        style={{ paddingHorizontal: GUTTER, marginTop: space.xxl }}
      >
        aduro · Accra
      </Text>
    </ScrollView>
  );
}
