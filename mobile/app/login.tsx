import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, LayoutAnimation, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { Symbol } from "../src/components/Symbol";
import { BrandMark } from "../src/components/BrandMark";
import { Mascot } from "../src/components/Mascot";
import { PressScale, Rise, useReducedMotion } from "../src/components/motion";
import { GUTTER, HAIRLINE, radius, space } from "../src/theme";
import { useIsDark, useTheme } from "../src/lib/useTheme";
import { adoptPurchases } from "../src/lib/purchases";
import {
  MIN_PASSWORD,
  sendPasswordReset,
  signIn,
  signUp,
  useAuth,
} from "../src/lib/useAuth";
import {
  AppleAuthentication,
  appleSignInAvailable,
  googleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from "../src/lib/socialAuth";
import type { Occasion } from "../src/lib/types";

type Mode = "signin" | "signup";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/*
 * What aduro plans, one turning into the next, each with the character for
 * it. The app plans more than dates now, and the first screen says so.
 */
const NEXT: { word: string; occasion: Occasion }[] = [
  { word: "date", occasion: "date_night" },
  { word: "birthday", occasion: "birthday" },
  { word: "link-up", occasion: "friend_outing" },
  { word: "day out", occasion: "family_day" },
  { word: "celebration", occasion: "celebration" },
  { word: "me-time", occasion: "solo_day" },
];

/**
 * Sign in.
 *
 * One column on a flat page: a sentence, a character, and a stack of
 * full-width pills, each the same shape so no one of them reads as the
 * default. The motion is small and in service of that: the last word of the
 * sentence turns over through what aduro plans while the character changes
 * with it, the ways in rise one after another, and a wrong password shakes
 * rather than only turning red.
 *
 * Every way in is a row of the same size. That is a design decision with a
 * rule behind it -- guideline 4.8 asks that Apple's option be no less
 * prominent than any other third-party sign-in -- and equal rows satisfy it
 * without anybody having to argue about which button looks bigger.
 *
 * There is no Facebook row: we do not have the provider, and a button that
 * cannot sign anybody in is worse than a shorter list.
 */
export default function Login() {
  const c = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();
  const reduced = useReducedMotion();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const [social, setSocial] = useState<"apple" | "google" | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    let active = true;
    void appleSignInAvailable().then((ok) => active && setAppleReady(ok));
    return () => {
      active = false;
    };
  }, []);

  /**
   * Both providers land here.
   *
   * A cancel is silent: someone who backed out of Apple's sheet knows they
   * backed out, and an error under the buttons would read as a fault.
   */
  async function social_(provider: "apple" | "google") {
    setSocial(provider);
    setError(null);
    setNotice(null);

    const result =
      provider === "apple" ? await signInWithApple() : await signInWithGoogle();

    setSocial(null);
    if (result.ok) {
      router.back();
      return;
    }
    if (!result.cancelled) setError(result.error ?? "That did not work.");
  }

  /*
   * Signing in dismisses this modal; the account lives on the You tab.
   *
   * An account-less session does not count. Before those existed any session
   * meant signed in, and left as it was this screen would have dismissed
   * itself the moment an account-less buyer opened it -- so the one person
   * App Review says must be able to register at any time never could.
   */
  useEffect(() => {
    if (session && !session.user.is_anonymous) {
      void adoptPurchases();
      router.back();
    }
  }, [session]);

  /*
   * Email is behind a tap, unless it is the only way in.
   *
   * Almost everyone here will use Apple or Google, and two empty text boxes at
   * the top of the first screen makes an app feel like paperwork. On a build
   * with neither provider available the form is shown outright, because a
   * screen whose only button reveals another button is a screen with no way in.
   */
  const hasProvider = appleReady || googleSignInAvailable();
  const showEmail = emailOpen || !hasProvider;

  // The sentence turns over until somebody starts typing, then holds still.
  useEffect(() => {
    if (reduced || showEmail) return;
    const t = setInterval(() => setTurn((n) => (n + 1) % NEXT.length), 2800);
    return () => clearInterval(t);
  }, [reduced, showEmail]);
  const now = NEXT[turn];

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  function openEmail(m: Mode) {
    // The form unfolds into the stack rather than appearing.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(m);
    setEmailOpen(true);
  }

  async function submit() {
    if (!email.includes("@")) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    const outcome =
      mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

    if (outcome.error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(outcome.error);
      return;
    }

    if (outcome.needsConfirmation) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice(
        `Almost there, confirm your address using the link we sent to ${email.trim()}, then sign in.`
      );
      setMode("signin");
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // The session listener above dismisses the modal.
  }

  async function forgot() {
    if (!email.includes("@")) {
      setError("Enter your email address first, then tap this again.");
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await sendPasswordReset(email);
    setBusy(false);

    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    setNotice(
      `If an account exists for ${email.trim()}, a reset link is on its way. Open it on this phone, set a password, then come back and sign in.`
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/*
        Dismiss, where there is something to go back to.

        Sign-in is reached two ways: chosen from Profile, and arrived at
        because something required an account. Only the first has anywhere to
        return to, so the control is hidden rather than dead in the second.
      */}
      {router.canGoBack() ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            position: "absolute",
            top: insets.top + space.sm,
            right: GUTTER,
            zIndex: 2,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: c.backgroundElement,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Symbol name="xmark" size={14} weight="semibold" color={c.textSecondary} />
        </Pressable>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingTop: insets.top + space.xxl,
          paddingBottom: Math.max(insets.bottom, space.lg) + space.lg,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
      >
        {/* ── the character, on a soft halo that breathes ── */}
        <Rise distance={24}>
          <View style={{ alignItems: "center", marginTop: space.lg, marginBottom: space.xl }}>
            <Halo reduced={reduced} />
            <MascotSwap occasion={showEmail ? "date_night" : now.occasion} animate={!reduced} />
          </View>
        </Rise>

        {/*
          Two-tone, so the sentence has a subject. The grey half is the setup
          and the turning word is the promise.
        */}
        <Rise delay={120}>
          <Text variant="largeTitle" center style={{ color: c.textSecondary }}>
            Plan your next
          </Text>
          <TurningWord word={showEmail ? (mode === "signup" ? "outing." : "one.") : `${now.word}.`} reduced={reduced} />
          <Text variant="body" tone="secondary" center style={{ marginTop: space.sm }}>
            Real places, real menus, real prices.
          </Text>
        </Rise>

        <View style={{ flex: 1, minHeight: space.xl }} />

        {error ? <Shake trigger={error}><Message text={error} tone="error" /></Shake> : null}
        {notice ? (
          <Rise trigger={notice}>
            <Message text={notice} tone="notice" />
          </Rise>
        ) : null}

        {/* ── the stack: email, Apple, Google, each the same 56pt pill ── */}
        {showEmail ? null : (
          <Rise delay={240}>
            <Pill
              label="Continue with email"
              icon={<Symbol name="envelope.fill" size={18} color={c.textSecondary} />}
              onPress={() => openEmail("signup")}
            />
          </Rise>
        )}

        {/*
          ── Apple, in Apple's own button ──

          Not a pill of ours with their logo in it. Apple ships this component
          and the styles it may wear, and a custom one is a thing a reviewer
          can reasonably object to on a screen whose entire job is to be
          trusted. Theirs also carries the wordmark, tracks the system theme
          and localises itself.
        */}
        {appleReady && AppleAuthentication ? (
          <Rise delay={300}>
            <View style={{ marginTop: space.sm }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  mode === "signin"
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                }
                buttonStyle={
                  isDark
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
                }
                cornerRadius={28}
                style={{ height: 56, width: "100%" }}
                onPress={() => void social_("apple")}
              />
            </View>
          </Rise>
        ) : null}

        {googleSignInAvailable() ? (
          <Rise delay={360}>
            <Pill
              label="Continue with Google"
              icon={<BrandMark provider="google" />}
              onPress={() => void social_("google")}
              loading={social === "google"}
              disabled={social !== null && social !== "google"}
            />
          </Rise>
        ) : null}

        {showEmail ? (
          <Rise style={{ marginTop: space.lg }}>
            <ModeToggle mode={mode} onChange={switchMode} />

            <View style={{ marginTop: space.lg }}>
              <Field
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoFocus
              />

              <Field
                label="Password"
                placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : "Your password"}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                // Lets iOS offer Keychain autofill and, on signup, a strong password.
                textContentType={mode === "signup" ? "newPassword" : "password"}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>

            <View style={{ marginTop: space.xs }}>
              <Button
                title={mode === "signin" ? "Sign in" : "Create account"}
                loading={busy}
                disabled={!email || password.length < (mode === "signup" ? MIN_PASSWORD : 1)}
                onPress={submit}
              />
            </View>

            {mode === "signin" ? (
              <Pressable onPress={forgot} disabled={busy} style={{ marginTop: space.md }}>
                <Text variant="footnote" tone="tint" weight="600" center>
                  Forgot your password?
                </Text>
              </Pressable>
            ) : null}
          </Rise>
        ) : (
          /*
            The way back in, for somebody who already has an account and is
            looking for what is in it rather than for a way to make another.
          */
          <Rise delay={420}>
            <Pressable onPress={() => openEmail("signin")} style={{ marginTop: space.lg, alignSelf: "center" }} hitSlop={8}>
              <Text variant="footnote" tone="secondary">
                Already have an account?{" "}
                <Text variant="footnote" tone="tint" weight="600">
                  Sign in
                </Text>
              </Text>
            </Pressable>
          </Rise>
        )}

        {/* What continuing agrees to, within a tap, as the store expects. */}
        <Rise delay={480}>
          <Text variant="caption" tone="tertiary" center style={{ marginTop: space.xl }}>
            By continuing you agree to the{" "}
            <Text variant="caption" tone="secondary" onPress={() => void Linking.openURL(`${WEB_URL}/terms`)} style={{ textDecorationLine: "underline" }}>
              Terms
            </Text>{" "}
            and{" "}
            <Text variant="caption" tone="secondary" onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)} style={{ textDecorationLine: "underline" }}>
              Privacy Policy
            </Text>
            .
          </Text>
        </Rise>
      </ScrollView>
    </View>
  );
}

/**
 * One row, the shape every other row is.
 *
 * Outlined rather than filled, so that nothing in the stack is styled as the
 * recommended choice: the person picks the account they already have.
 */
function Pill({
  label,
  icon,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      to={0.97}
      style={{
        height: 56,
        borderRadius: 28,
        borderWidth: HAIRLINE,
        borderColor: c.borderStrong,
        backgroundColor: c.backgroundElement,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
        marginTop: space.sm,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={c.text} />
      ) : (
        <>
          {/*
            The mark sits at the edge and the label stays centred on the row,
            so rows with marks of different widths still read as one stack.
          */}
          {icon ? <View style={{ position: "absolute", left: space.lg }}>{icon}</View> : null}
          <Text variant="headline" weight="600">
            {label}
          </Text>
        </>
      )}
    </PressScale>
  );
}

/** The character, popping in afresh each time it changes. */
function MascotSwap({ occasion, animate }: { occasion: Occasion; animate: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animate) return;
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [occasion, animate, pop]);
  return (
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Mascot occasion={occasion} size={150} animate={animate} />
    </Animated.View>
  );
}

/** A soft circle behind the character, with a ring that breathes out from it. */
function Halo({ reduced }: { reduced: boolean }) {
  const c = useTheme();
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, ring]);

  const disc = { position: "absolute" as const, width: 190, height: 190, borderRadius: 95, top: -20 };
  return (
    <>
      <Animated.View
        style={{
          ...disc,
          borderWidth: 2,
          borderColor: c.accentBorder,
          opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
          transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
        }}
      />
      <View style={{ ...disc, backgroundColor: c.accentSoft }} />
    </>
  );
}

/**
 * The last word of the sentence, turning over: the old word lifts away and
 * the new one rises in from below.
 */
function TurningWord({ word, reduced }: { word: string; reduced: boolean }) {
  const c = useTheme();
  const [shown, setShown] = useState(word);
  const v = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (word === shown) return;
    if (reduced) {
      setShown(word);
      return;
    }
    Animated.timing(v, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setShown(word);
      v.setValue(-1);
      Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
    });
  }, [word, shown, reduced, v]);

  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 0, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [18, -14, 0] }) }],
      }}
    >
      <Text variant="largeTitle" center weight="800" style={{ color: c.accent }}>
        {shown}
      </Text>
    </Animated.View>
  );
}

/** Sign in or create account, as two halves with a thumb that slides between them. */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(mode === "signup" ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: mode === "signup" ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [mode, x]);

  const half = Math.max(0, (width - 8) / 2);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: 44, borderRadius: 22, backgroundColor: c.backgroundSelected, padding: 4, flexDirection: "row" }}
    >
      {width ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            width: half,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.backgroundElement,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, half] }) }],
          }}
        />
      ) : null}
      {(["signin", "signup"] as Mode[]).map((m) => (
        <Pressable
          key={m}
          onPress={() => {
            void Haptics.selectionAsync();
            onChange(m);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === m }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text variant="subheadline" weight="600" style={{ color: mode === m ? c.text : c.textSecondary }}>
            {m === "signin" ? "Sign in" : "Create account"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A wrong answer shakes its head, once, rather than only turning red. */
function Shake({ trigger, children }: { trigger: unknown; children: React.ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    x.setValue(0);
    Animated.sequence(
      [10, -8, 6, -4, 0].map((to) => Animated.timing(x, { toValue: to, duration: 55, useNativeDriver: true }))
    ).start();
  }, [trigger, x]);
  return <Animated.View style={{ transform: [{ translateX: x }] }}>{children}</Animated.View>;
}

function Message({ text, tone }: { text: string; tone: "error" | "notice" }) {
  const c = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.sm,
        marginBottom: space.sm,
        padding: space.md,
        borderRadius: radius.control,
        backgroundColor: tone === "error" ? c.dangerSoft : c.accentSoft,
      }}
    >
      <Symbol
        name={tone === "error" ? "exclamationmark.circle.fill" : "envelope.badge.fill"}
        size={15}
        color={tone === "error" ? c.danger : c.accent}
      />
      <Text variant="footnote" style={{ flex: 1, color: tone === "error" ? c.danger : c.accent }}>
        {text}
      </Text>
    </View>
  );
}
