import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, ScrollView, View } from "react-native";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Group, Row } from "../../src/components/List";
import { Symbol } from "../../src/components/Symbol";
import { Toast } from "../../src/components/Toast";
import { GUTTER, TAB_BAR, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth, signOut } from "../../src/lib/useAuth";
import { clearDraft, loadDraft } from "../../src/lib/draft";
import { resetOnboarding } from "../../src/lib/onboarding";
import { countSavedPlans, deleteAccount } from "../../src/lib/account";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const SUPPORT_EMAIL = "amoateydarryl4@gmail.com";

/*
 * The numeric App Store ID, from App Store Connect under App Information.
 * It does not exist until the app record is created there, so until it is
 * filled in the Rate row is hidden rather than shipped pointing at
 * id0000000000, which opens the App Store on nothing and reads as a bug to
 * the first person who taps it.
 */
const APP_STORE_ID = "";

export default function Profile() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [hasDraft, setHasDraft] = useState(false);
  const [planCount, setPlanCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadDraft().then((d) => active && setHasDraft(Boolean(d?.inputs)));
      if (session) {
        void countSavedPlans().then((n) => active && setPlanCount(n));
      } else {
        setPlanCount(null);
      }
      return () => {
        active = false;
      };
    }, [session])
  );

  const open = (path: string) => {
    if (!WEB_URL) {
      setToast("Could not open that.");
      return;
    }
    void Linking.openURL(`${WEB_URL}${path}`);
  };

  /**
   * Deleting an account is irreversible and is required to be reachable from
   * inside the app, so it asks twice: once for intent, once for certainty.
   */
  function confirmDelete() {
    Alert.alert(
      "Delete account?",
      "Your account and saved plans go for good. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert("Are you sure?", "There is no way back from this.", [
              { text: "Keep my account", style: "cancel" },
              { text: "Delete for good", style: "destructive", onPress: () => void runDelete() },
            ]),
        },
      ]
    );
  }

  async function runDelete() {
    setBusy(true);
    try {
      const ok = await deleteAccount();
      if (!ok) {
        setToast("Could not delete the account. Try again.");
        return;
      }
      await clearDraft();
      await signOut();
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: TAB_BAR.clearance,
      }}
    >
      <Text
        variant="display"
        uppercase
        style={{ paddingHorizontal: GUTTER, marginBottom: space.xl }}
      >
        You
      </Text>

      {session ? (
        <Group header="Account">
          <Row icon="envelope.fill" title={session.user.email ?? "Signed in"} />
          <Row
            icon="bookmark.fill"
            title="Saved plans"
            value={planCount === null ? "" : String(planCount)}
            chevron
            onPress={() => router.push("/(tabs)/saved")}
          />
        </Group>
      ) : (
        <View style={{ paddingHorizontal: GUTTER, marginBottom: space.xxl }}>
          <View
            style={{
              backgroundColor: c.backgroundElement,
              borderRadius: 12,
              padding: space.xl,
              alignItems: "center",
            }}
          >
            <Symbol name="person.crop.circle" size={40} color={c.textSecondary} />
            <Text variant="headline" center style={{ marginTop: space.md }}>
              Sign in to save plans
            </Text>
            <Text
              variant="footnote"
              tone="secondary"
              center
              style={{ marginTop: space.xs, marginBottom: space.lg }}
            >
              Planning works without an account.
            </Text>
            <Button title="Sign in" onPress={() => router.push("/login")} />
          </View>
        </View>
      )}

      <Group header="This device">
        <Row
          icon="sparkles"
          title="Replay the intro"
          onPress={async () => {
            await resetOnboarding();
            router.replace("/onboarding");
          }}
        />
        <Row
          icon="trash"
          iconColor={c.danger}
          title="Clear in-progress plan"
          subtitle={hasDraft ? undefined : "Nothing in progress"}
          destructive
          disabled={!hasDraft}
          onPress={() =>
            Alert.alert("Clear in-progress plan?", "Saved plans are not affected.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Clear",
                style: "destructive",
                onPress: async () => {
                  await clearDraft();
                  setHasDraft(false);
                },
              },
            ])
          }
        />
      </Group>

      <Group header="Support">
        <Row
          icon="envelope"
          title="Contact us"
          chevron
          onPress={() =>
            Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("aduro")}`)
          }
        />
        {APP_STORE_ID ? (
          <Row
            icon="star"
            title="Rate aduro"
            chevron
            onPress={() =>
              Linking.openURL(
                `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`
              )
            }
          />
        ) : null}
      </Group>

      <Group header="Legal">
        <Row icon="hand.raised" title="Privacy" chevron onPress={() => open("/privacy")} />
        <Row icon="doc.text" title="Terms of use" chevron onPress={() => open("/terms")} />
      </Group>

      {session ? (
        <>
          {/* A red row rather than a button: this is where iOS puts it, and
              it should not sit next to Sign out looking equally routine. */}
          <Group>
            <Row
              icon="person.crop.circle.badge.xmark"
              iconColor={c.danger}
              title="Delete account"
              destructive
              disabled={busy}
              trailing={busy ? <ActivityIndicator size="small" color={c.danger} /> : undefined}
              onPress={confirmDelete}
            />
          </Group>

          <View style={{ paddingHorizontal: GUTTER }}>
            <Button title="Sign out" kind="gray" onPress={() => void signOut()} />
          </View>
        </>
      ) : null}

      <Text
        variant="caption1"
        tone="tertiary"
        center
        style={{ paddingHorizontal: GUTTER, marginTop: space.xxl }}
      >
        aduro {Constants.expoConfig?.version ?? ""} · Accra
      </Text>

      <Toast message={toast} onDone={() => setToast(null)} />
    </ScrollView>
  );
}
