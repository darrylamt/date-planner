import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Group, Row } from "../../src/components/List";
import { Symbol } from "../../src/components/Symbol";
import { Toast } from "../../src/components/Toast";
import { GUTTER, TAB_BAR, radius, space, type as typeScale } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth, signOut } from "../../src/lib/useAuth";
import { useAppearance } from "../../src/lib/appearance";
import { clearDraft, loadDraft } from "../../src/lib/draft";
import { resetOnboarding } from "../../src/lib/onboarding";
import {
  countSavedPlans,
  deleteAccount,
  fetchProfile,
  updateDisplayName,
  uploadAvatar,
  type Profile as AccountProfile,
} from "../../src/lib/account";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const SUPPORT_EMAIL = "planbyaduro@gmail.com";

/*
 * The numeric App Store ID, from App Store Connect under App Information.
 * It does not exist until the app record is created there, so until it is
 * filled in the Rate row is hidden rather than shipped pointing at
 * id0000000000, which opens the App Store on nothing and reads as a bug to
 * the first person who taps it.
 */
const APP_STORE_ID = "6809005685";

export default function Profile() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { preference, scheme, setPreference } = useAppearance();

  const [hasDraft, setHasDraft] = useState(false);
  const [planCount, setPlanCount] = useState<number | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadDraft().then((d) => active && setHasDraft(Boolean(d?.inputs)));
      if (session) {
        void countSavedPlans().then((n) => active && setPlanCount(n));
        void fetchProfile().then((p) => active && setProfile(p));
      } else {
        setPlanCount(null);
        setProfile(null);
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

  async function pickAvatar() {
    /*
     * Permission is requested at the moment of tapping rather than on load.
     * Asking before there is a reason is how an app gets denied once and then
     * has no way back without a trip to Settings.
     */
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setToast("Photo access is off. Turn it on in Settings to set a picture.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      // Compressed on the way out: an avatar renders at 96 points and a
      // 4MB upload from a modern camera is bandwidth nobody benefits from.
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    setUploading(true);
    const url = await uploadAvatar(picked.assets[0].uri);
    setUploading(false);

    if (!url) {
      setToast("That picture did not upload.");
      return;
    }
    setProfile((cur) => (cur ? { ...cur, avatarUrl: url } : cur));
    setToast("Picture updated.");
  }

  async function saveName() {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === profile?.displayName) return;

    const ok = await updateDisplayName(next);
    if (ok) {
      setProfile((cur) => (cur ? { ...cur, displayName: next } : cur));
    } else {
      setToast("Could not save that name.");
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
        variant="title2"
        center
        style={{ paddingHorizontal: GUTTER, marginBottom: space.lg }}
      >
        Settings
      </Text>

      {session ? (
        <>
          {/*
            The identity card, which is what a settings screen opens with on
            iOS. The avatar is the first letter of the email rather than an
            upload: there is no photo to show, and a grey silhouette says
            "unfinished" where a monogram says "you".
          */}
          <View style={{ paddingHorizontal: GUTTER, marginBottom: space.lg }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                backgroundColor: c.backgroundElement,
                borderRadius: radius.card,
                padding: space.md,
              }}
            >
              <Pressable onPress={pickAvatar} disabled={uploading}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : profile?.avatarUrl ? (
                    <Image
                      source={{ uri: profile.avatarUrl }}
                      style={{ width: 56, height: 56 }}
                      contentFit="cover"
                    />
                  ) : (
                    <Text variant="title3" style={{ color: "#FFFFFF" }}>
                      {(profile?.displayName ?? "?").slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                {/* A camera badge, because a tappable avatar with no
                    affordance is one nobody discovers. */}
                <View
                  style={{
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: c.backgroundElement,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Symbol name="camera.fill" size={11} color={c.textSecondary} />
                </View>
              </Pressable>

              <View style={{ flex: 1 }}>
                {editingName ? (
                  <TextInput
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    onBlur={saveName}
                    onSubmitEditing={saveName}
                    autoFocus
                    maxLength={60}
                    returnKeyType="done"
                    placeholder="Your name"
                    placeholderTextColor={c.textTertiary}
                    style={{
                      color: c.text,
                      fontSize: typeScale.headline.fontSize,
                      fontWeight: typeScale.headline.fontWeight,
                      paddingVertical: 0,
                    }}
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      setNameDraft(profile?.displayName ?? "");
                      setEditingName(true);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
                  >
                    <Text variant="headline" numberOfLines={1}>
                      {profile?.displayName ?? "You"}
                    </Text>
                    <Symbol name="pencil" size={13} color={c.textTertiary} />
                  </Pressable>
                )}
                <Text variant="footnote" tone="secondary" numberOfLines={1}>
                  {profile?.email ?? session.user.email ?? ""}
                </Text>
              </View>

              <Pressable onPress={() => router.push("/(tabs)/saved")} hitSlop={10}>
                <Text variant="footnote" tone="secondary">
                  {planCount === null ? "" : `${planCount} saved`}
                </Text>
              </Pressable>
            </View>
          </View>
        </>
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

      <Group header="Appearance">
        <Row
          icon="moon"
          title="Dark mode"
          subtitle={preference === "system" ? "Following your phone" : undefined}
          trailing={
            <Switch
              value={scheme === "dark"}
              onValueChange={(on) => setPreference(on ? "dark" : "light")}
              trackColor={{ true: c.accent, false: c.backgroundSelected }}
            />
          }
        />
        {preference !== "system" ? (
          <Row
            icon="iphone"
            title="Match my phone instead"
            onPress={() => setPreference("system")}
          />
        ) : null}
      </Group>

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

          {/*
            A full-width pill rather than a list row, which is the one control
            on this screen someone comes looking for deliberately.
          */}
          <View style={{ paddingHorizontal: GUTTER, marginTop: space.lg }}>
            <Pressable
              onPress={() => void signOut()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: space.sm,
                backgroundColor: c.backgroundElement,
                borderRadius: radius.pill,
                paddingVertical: space.md,
              }}
            >
              <Symbol name="rectangle.portrait.and.arrow.right" size={18} color={c.danger} />
              <Text variant="headline" style={{ color: c.danger }}>
                Log out
              </Text>
            </Pressable>
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
