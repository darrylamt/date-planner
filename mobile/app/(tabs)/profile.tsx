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
import * as Updates from "expo-updates";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Group, Row } from "../../src/components/List";
import { BirthdayRow } from "../../src/components/profile/BirthdayRow";
import { Symbol } from "../../src/components/Symbol";
import { Toast } from "../../src/components/Toast";
import { GUTTER, TAB_BAR, radius, space, type as typeScale } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth, signOut } from "../../src/lib/useAuth";
import { useAppearance } from "../../src/lib/appearance";
import { AppIconPicker, appIconsAvailable } from "../../src/components/AppIconPicker";
import { IssueSheet } from "../../src/components/IssueSheet";
import { getAiConsent, setAiConsent } from "../../src/lib/aiConsent";
import { ProSheet } from "../../src/components/profile/ProSheet";
import { fetchAllowance } from "../../src/lib/chat";
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
import { Image } from "expo-image";
import { nativeOptional } from "../../src/lib/nativeOptional";

/*
 * Added after the build on TestFlight, so it is resolved defensively. An
 * older binary receiving this bundle gets null and simply cannot change its
 * picture, rather than crashing the whole Profile screen on open.
 */
const ImagePicker = nativeOptional<typeof import("expo-image-picker")>(() =>
  require("expo-image-picker")
);

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
  const { session, anonymous } = useAuth();
  /*
   * An account, as opposed to a session. Somebody who bought Pro without
   * registering has a session and no account, and should see Sign in here,
   * not a nameless identity card with a Sign out button that would orphan
   * the subscription they just paid for.
   */
  const hasAccount = Boolean(session) && !anonymous;
  const { preference, scheme, setPreference } = useAppearance();

  const [showBuild, setShowBuild] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [planCount, setPlanCount] = useState<number | null>(null);

  /*
   * "Built in" is the app binary from TestFlight; anything newer arrived as an
   * over-the-air update. Updates.createdAt is null on a build running its own
   * bundled code, which is exactly the case worth naming out loud.
   */
  const buildLine = Updates.createdAt
    ? `Updated ${Updates.createdAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })}, ${Updates.createdAt.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "Running the installed build";
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [aiAllowed, setAiAllowed] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [allowance, setAllowance] = useState<Awaited<ReturnType<typeof fetchAllowance>>>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadDraft().then((d) => active && setHasDraft(Boolean(d?.inputs)));
      void getAiConsent().then((v) => active && setAiAllowed(v === "granted"));
      if (session) {
        void countSavedPlans().then((n) => active && setPlanCount(n));
        void fetchProfile().then((p) => active && setProfile(p));
        void fetchAllowance().then((a) => active && setAllowance(a));
      } else {
        setPlanCount(null);
        setProfile(null);
        setAllowance(null);
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
      /*
       * Apple's account-deletion guidance, for apps that sell subscriptions:
       * say that billing continues through Apple until it is cancelled.
       * Deleting the row here stops nothing at Apple, and somebody who
       * assumed it did would be charged again next month.
       */
      "Your account, saved plans and conversations go for good. This cannot be undone.\n\nIf you subscribe to aduro Pro, Apple keeps billing until you cancel it in Settings, under your name, then Subscriptions.",
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
    if (!ImagePicker) {
      setToast("Update the app to change your picture.");
      return;
    }

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
      /*
       * Confirmed out loud. There is no Save button here, the name is written
       * when the field loses focus, and a silent write leaves someone
       * wondering whether tapping away threw their change out.
       */
      setToast("Name saved.");
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

      {hasAccount ? (
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
                  {profile?.email ?? session?.user.email ?? ""}
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

      {/*
        Only for somebody signed in: a birthday is stored against an account,
        and offering the field to a signed-out visitor would be offering
        somewhere to type that goes nowhere.
      */}
      {hasAccount ? (
        <Group header="About you">
          <BirthdayRow
            day={profile?.birthDay ?? null}
            month={profile?.birthMonth ?? null}
            onSaved={(birthDay, birthMonth) =>
              setProfile((p) => (p ? { ...p, birthDay, birthMonth } : p))
            }
          />
        </Group>
      ) : null}

      {/*
        The only way to choose to subscribe.

        The paywall used to have one door -- send five messages, be refused --
        which meant somebody who simply wanted to pay could not, and a reviewer
        signed in on an account that already had Pro could never reach the
        purchase at all. Shown signed-out too, because the answer to "what does
        this cost" should not require an account first.
      */}
      <Group header="Subscription">
        <Row
          icon="sparkles"
          title="aduro Pro"
          subtitle={
            allowance?.tier === "pro"
              ? "Subscribed"
              : hasAccount && allowance
                ? `Free · ${allowance.remaining} of ${allowance.allowance} messages left this month`
                : "Unlimited chat with the assistant"
          }
          chevron
          /*
           * Straight to the subscription, account or not.
           *
           * This sent anybody signed out to the sign-in screen first, which is
           * the exact thing App Review rejected under 5.1.1(v): requiring
           * registration to buy something that is not account-based.
           */
          onPress={() => setProOpen(true)}
        />
      </Group>

      {/*
        The other half of asking permission: being able to take it back.
        Off means plans get a plain description and the assistant asks again
        before anything is sent.
      */}
      <Group header="Privacy">
        <Row
          icon="sparkles"
          title="Use AI (Anthropic's Claude)"
          subtitle="For plan descriptions and the assistant. What you type is sent to Anthropic."
          trailing={
            <Switch
              value={aiAllowed}
              onValueChange={(on) => {
                setAiAllowed(on);
                void setAiConsent(on ? "granted" : "declined");
              }}
              trackColor={{ true: c.accent, false: c.backgroundSelected }}
            />
          }
        />
      </Group>

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
        {/* Hidden rather than disabled on a build without the module: a row
            that explains why it cannot work is worse than no row. */}
        {appIconsAvailable() ? (
          <Row
            icon="app.badge"
            title="App icon"
            subtitle="Pick a mascot for your home screen"
            chevron
            onPress={() => setIconPickerOpen(true)}
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
        {/*
          Above Contact us, and separate from it.

          A mailto lands in an inbox, needs a mail app configured, and arrives
          with none of what the app knew at the time. This lands in a queue
          with the screen, the build and the error attached. The mail row
          stays for everything that is a question rather than a fault.
        */}
        <Row
          icon="exclamationmark.bubble"
          title="Report a problem"
          chevron
          onPress={() => setIssueOpen(true)}
        />
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

      {hasAccount ? (
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

      {/*
        Which build is actually running, not which one was published.
        
        Updates download in the background and apply on the next launch, so a
        tester who has just been told a fix is out can be a launch behind it
        with no way to tell. Every report of "I still cannot see it" has so far
        been this, and answering it has meant guessing. The date is here rather
        than the update's id because a person can compare a date to a message
        they were sent; an id is only useful once something is already wrong,
        so it sits behind a tap.
      */}
      <Pressable
        onPress={() => setShowBuild((v) => !v)}
        style={{ paddingHorizontal: GUTTER, marginTop: space.xxl }}
      >
        <Text variant="caption1" tone="tertiary" center>
          aduro {Constants.expoConfig?.version ?? ""} · Accra
        </Text>
        <Text variant="caption2" tone="tertiary" center style={{ marginTop: 2 }}>
          {buildLine}
        </Text>
        {showBuild ? (
          <Text variant="caption2" tone="tertiary" center style={{ marginTop: 2 }}>
            {Updates.updateId ?? "no update id"}
          </Text>
        ) : null}
      </Pressable>

      <AppIconPicker
        visible={iconPickerOpen}
        onClose={() => setIconPickerOpen(false)}
        onChanged={setToast}
      />

      <ProSheet
        visible={proOpen}
        onClose={() => setProOpen(false)}
        accountless={!hasAccount}
        tier={allowance?.tier ?? "free"}
        /*
         * Re-read rather than assume. The purchase tells RevenueCat, which
         * tells our webhook, which writes the row the server gates on.
         * Flipping the label locally would be a subscription the app
         * believes in and the server does not.
         */
        onPurchased={() => {
          void fetchAllowance().then(setAllowance);
          setToast("Welcome to aduro Pro.");
        }}
      />

      <IssueSheet
        visible={issueOpen}
        onClose={() => setIssueOpen(false)}
        onDone={setToast}
        context={{ screen: "profile" }}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </ScrollView>
  );
}
