import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutAnimation,
  Linking,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Field } from "../src/components/Field";
import { Symbol } from "../src/components/Symbol";
import { BrandMark } from "../src/components/BrandMark";
import { Mascot } from "../src/components/Mascot";
import { PressScale, Rise, useReducedMotion } from "../src/components/motion";
import { GUTTER, space } from "../src/theme";
import { useIsDark, useTheme } from "../src/lib/useTheme";
import { useSeason } from "../src/lib/season";
import { MeshBackground, meshAvailable } from "../src/components/native/MeshBackground";
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
const CORAL = "#E4572E";
const GOLD = "#E5B04E";
const BUTTON_H = 56;
const BUTTON_R = 16;

/*
 * What Duro plans, one turning into the next: the word, the character for
 * it, and three things such an outing might hold, floating round the
 * character like the stops of a plan.
 */
const NEXT: { word: string; occasion: Occasion; bits: [string, string, string] }[] = [
  { word: "date", occasion: "date_night", bits: ["🍽️ Dinner in Osu", "🍸 Cocktails after", "🌙 Home by eleven"] },
  { word: "birthday", occasion: "birthday", bits: ["🎂 Cake collected", "🎳 Bowling for six", "🍕 Dinner after"] },
  { word: "link-up", occasion: "friend_outing", bits: ["🍗 Grills and drinks", "🎤 Karaoke", "🚗 Rides sorted"] },
  { word: "day out", occasion: "family_day", bits: ["🌳 Gardens first", "🍦 Ice cream stop", "🚗 Rides sorted"] },
  { word: "celebration", occasion: "celebration", bits: ["🥂 A proper toast", "🍽️ Dinner for eight", "💃 Dancing after"] },
  { word: "me-time", occasion: "solo_day", bits: ["💆 A massage", "☕ A slow brunch", "📚 A quiet corner"] },
];

/**
 * Sign in.
 *
 * Two layers: a colourful stage at the top, where the character floats among
 * the pieces of an outing over a slow sunset mesh, and a clean sheet that
 * slides up over it carrying the words and the ways in. The stage is the
 * promise and the sheet is the task, so the sheet stays plain.
 *
 * Every third-party way in is a button of the same size, Apple's in Apple's
 * own component: guideline 4.8 asks that Apple's option be no less prominent
 * than any other, and equal buttons settle it. Email is behind a tap unless it
 * is the only way in, and opens in the sheet in place of the buttons.
 */
export default function Login() {
  const c = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();
  const reduced = useReducedMotion();
  const { season } = useSeason();
  const { height } = useWindowDimensions();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const [social, setSocial] = useState<"apple" | "google" | null>(null);
  // "login?email=1" opens straight onto the form, for a link that means email.
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [emailOpen, setEmailOpen] = useState(emailParam === "1");
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    let active = true;
    void appleSignInAvailable().then((ok) => active && setAppleReady(ok));
    return () => {
      active = false;
    };
  }, []);

  /**
   * Both providers land here. A cancel is silent: someone who backed out of
   * Apple's sheet knows they did, and an error would read as a fault.
   */
  async function social_(provider: "apple" | "google") {
    setSocial(provider);
    setError(null);
    setNotice(null);
    const result = provider === "apple" ? await signInWithApple() : await signInWithGoogle();
    setSocial(null);
    if (result.ok) {
      router.back();
      return;
    }
    if (!result.cancelled) setError(result.error ?? "That did not work.");
  }

  /*
   * Signing in dismisses this modal. An account-less session does not count,
   * or the screen would close itself on the one person App Review says must
   * be able to register at any time.
   */
  useEffect(() => {
    if (session && !session.user.is_anonymous) {
      void adoptPurchases();
      router.back();
    }
  }, [session]);

  // With neither provider on this build, the form is the only way in, so it is open.
  const hasProvider = appleReady || googleSignInAvailable();
  const showEmail = emailOpen || !hasProvider;

  // The stage turns over until somebody opens the form, then holds still.
  useEffect(() => {
    if (reduced || showEmail) return;
    const t = setInterval(() => setTurn((n) => (n + 1) % NEXT.length), 3200);
    return () => clearInterval(t);
  }, [reduced, showEmail]);
  const now = NEXT[turn];

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  function toggleEmail(open: boolean, m: Mode = mode) {
    LayoutAnimation.configureNext(LayoutAnimation.create(320, "easeInEaseOut", "opacity"));
    setMode(m);
    setError(null);
    setEmailOpen(open);
  }

  async function submit() {
    if (!email.includes("@")) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const outcome = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

    if (outcome.error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(outcome.error);
      return;
    }
    if (outcome.needsConfirmation) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice(`Almost there. Confirm your address with the link we sent to ${email.trim()}, then sign in.`);
      setMode("signin");
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  // The stage gives up height to the form, so the fields sit above the keyboard.
  const stageH = Math.round(height * (showEmail ? 0.3 : 0.5));

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── the stage ── */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: stageH + 40, overflow: "hidden" }}>
        <Mesh reduced={reduced} dark={isDark} />
        <View style={{ position: "absolute", left: 0, right: 0, top: insets.top, bottom: 40, alignItems: "center", justifyContent: "center" }}>
          {/* The season's logo above the character, while there is room for it. */}
          {season === "halloween" && !showEmail ? (
            <Image
              source={require("../assets/halloween/logo.png")}
              style={{ width: 230, aspectRatio: 920 / 365, borderRadius: 16, marginBottom: space.md }}
              contentFit="cover"
              accessibilityLabel="Duro! Halloween"
            />
          ) : null}
          {!showEmail ? <Bits key={now.word} bits={now.bits} reduced={reduced} /> : null}
          <Character occasion={showEmail ? "date_night" : now.occasion} small={showEmail} reduced={reduced} />
        </View>
      </View>

      {/*
        Dismiss, where there is something to go back to. Reached from Profile
        it returns there; reached because something needed an account, there
        is nowhere to go back to and it is hidden rather than dead.
      */}
      {router.canGoBack() ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ position: "absolute", top: insets.top + space.sm, right: GUTTER, zIndex: 3, borderRadius: 18, overflow: "hidden" }}
        >
          <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
            <Symbol name="xmark" size={14} weight="bold" color={c.text} />
          </BlurView>
        </Pressable>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: stageH }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {/* ── the sheet ── */}
        <Sheet bottom={Math.max(insets.bottom, space.lg) + space.md}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: space.lg }} />

          <Rise delay={200}>
            <Text variant="largeTitle" weight="800" style={{ letterSpacing: -0.6 }}>
              Plan your next
            </Text>
            <TurningWord word={showEmail ? (mode === "signup" ? "outing." : "one.") : `${now.word}.`} reduced={reduced} />
            <Text variant="body" tone="secondary" style={{ marginTop: space.xs }}>
              Real places, real menus, real prices. Sorted in a minute.
            </Text>
          </Rise>

          <View style={{ marginTop: space.xl }}>
            {error ? (
              <Shake trigger={error}>
                <Message text={error} tone="error" />
              </Shake>
            ) : null}
            {notice ? (
              <Rise trigger={notice}>
                <Message text={notice} tone="notice" />
              </Rise>
            ) : null}

            {showEmail ? (
              <EmailForm
                mode={mode}
                email={email}
                password={password}
                busy={busy}
                setEmail={setEmail}
                setPassword={setPassword}
                switchMode={switchMode}
                submit={submit}
                forgot={forgot}
                back={hasProvider ? () => toggleEmail(false) : undefined}
              />
            ) : (
              <>
                {/*
                  Apple, in Apple's own button: a custom one is a thing a
                  reviewer can reasonably object to on a screen whose job is to
                  be trusted. Black on light, white on dark, the boldest row.
                */}
                {appleReady && AppleAuthentication ? (
                  <Rise delay={320}>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={
                        isDark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={BUTTON_R}
                      style={{ height: BUTTON_H, width: "100%", marginBottom: space.sm }}
                      onPress={() => void social_("apple")}
                    />
                  </Rise>
                ) : null}

                {googleSignInAvailable() ? (
                  <Rise delay={380}>
                    <WayIn
                      label="Continue with Google"
                      icon={<BrandMark provider="google" />}
                      onPress={() => void social_("google")}
                      loading={social === "google"}
                      disabled={social !== null && social !== "google"}
                      kind="plain"
                    />
                  </Rise>
                ) : null}

                <Rise delay={440}>
                  <WayIn
                    label="Continue with email"
                    icon={<Symbol name="envelope.fill" size={17} color={c.accent} />}
                    onPress={() => toggleEmail(true, "signup")}
                    kind="tinted"
                  />
                </Rise>

                <Rise delay={500}>
                  <Pressable onPress={() => toggleEmail(true, "signin")} hitSlop={10} style={{ alignSelf: "center", marginTop: space.md }}>
                    <Text variant="subheadline" tone="secondary">
                      Already have an account?{" "}
                      <Text variant="subheadline" tone="tint" weight="700">
                        Sign in
                      </Text>
                    </Text>
                  </Pressable>
                </Rise>
              </>
            )}
          </View>

          <View style={{ flex: 1, minHeight: space.lg }} />

          {/* What continuing agrees to, a tap away, as the store expects. */}
          <Text variant="caption" tone="tertiary" center style={{ marginTop: space.lg }}>
            By continuing you agree to the{" "}
            <Text variant="caption" tone="secondary" weight="600" onPress={() => void Linking.openURL(`${WEB_URL}/terms`)}>
              Terms
            </Text>{" "}
            and{" "}
            <Text variant="caption" tone="secondary" weight="600" onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)}>
              Privacy Policy
            </Text>
          </Text>
        </Sheet>
      </ScrollView>
    </View>
  );
}

/* ── the stage ──────────────────────────────────────────────────────────── */

/**
 * A slow sunset mesh: three soft blobs, teal, coral and gold, drifting under
 * a frosted blur. No gradient library is needed, and on a phone the blur
 * blends them the way a real mesh gradient would.
 */
function Mesh({ reduced, dark }: { reduced: boolean; dark: boolean }) {
  const c = useTheme();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, t]);

  /*
   * SwiftUI's mesh, on build 24 and iOS 18: the same accent, coral and gold,
   * blended as one surface instead of four blurred circles drifting under a
   * frosted pane. Everywhere else, the circles.
   */
  if (meshAvailable()) {
    const base = dark ? "#0A1715" : "#FFF6EC";
    const a = (hex: string, alpha: string) => (dark ? `${hex}${alpha}` : hex);
    return (
      <View style={{ flex: 1, backgroundColor: base }}>
        <MeshBackground
          colors={[a(c.accent, "B3"), base, a(CORAL, "99"), base, a(GOLD, "80"), base, a(GOLD, "99"), a(c.accent, "99"), base]}
        />
      </View>
    );
  }

  const blob = (color: string, size: number, x: number, y: number, dx: number, dy: number) => (
    <Animated.View
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        left: x,
        top: y,
        backgroundColor: color,
        opacity: dark ? 0.55 : 0.95,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
        ],
      }}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: dark ? "#0A1715" : "#FFF6EC" }}>
      {blob(c.accent, 320, -110, -60, 60, 40)}
      {blob(CORAL, 280, 170, -20, -50, 60)}
      {blob(GOLD, 260, 40, 170, 40, -50)}
      {blob(c.accent, 200, 230, 230, -40, -30)}
      <BlurView intensity={dark ? 70 : 60} tint={dark ? "dark" : "light"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
    </View>
  );
}

/** The character, floating over its own shadow, popping in when it changes. */
function Character({ occasion, small, reduced }: { occasion: Occasion; small: boolean; reduced: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    pop.setValue(0.5);
    Animated.spring(pop, { toValue: 1, useNativeDriver: false, speed: 12, bounciness: 14 }).start();
  }, [occasion, reduced, pop]);
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, bob]);

  const size = small ? 110 : 170;
  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View
        style={{ transform: [{ scale: pop }, { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }] }}
      >
        <Mascot occasion={occasion} size={size} animate={!reduced} />
      </Animated.View>
      {/* The shadow tightens as the character rises, so it reads as floating. */}
      <Animated.View
        style={{
          width: size * 0.36,
          height: 8,
          borderRadius: 4,
          marginTop: -4,
          backgroundColor: "rgba(0,0,0,0.10)",
          transform: [{ scaleX: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }) }],
          opacity: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }),
        }}
      />
    </View>
  );
}

/** Three pieces of an outing, frosted pills bobbing round the character. */
function Bits({ bits, reduced }: { bits: [string, string, string]; reduced: boolean }) {
  const spots = [
    { top: "14%", left: "6%" },
    { top: "40%", right: "5%" },
    // Clear of the sheet's shadow, which would dim it.
    { bottom: "22%", left: "8%" },
  ] as const;
  return (
    <>
      {bits.map((b, i) => (
        <Bit key={b} text={b} index={i} spot={spots[i]} reduced={reduced} />
      ))}
    </>
  );
}

function Bit({
  text,
  index,
  spot,
  reduced,
}: {
  text: string;
  index: number;
  spot: { top?: string; bottom?: string; left?: string; right?: string };
  reduced: boolean;
}) {
  const c = useTheme();
  const isDark = useIsDark();
  const inV = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.spring(inV, { toValue: 1, delay: 150 + index * 140, useNativeDriver: false, speed: 12, bounciness: 12 }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1900 + index * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(bob, { toValue: 0, duration: 1900 + index * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, index, inV, bob]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        ...(spot as object),
        opacity: inV,
        transform: [
          { scale: inV.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, index % 2 ? 6 : -6] }) },
          { rotate: index === 1 ? "3deg" : "-3deg" },
        ],
      }}
    >
      <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: c.glassBorder }}>
        <BlurView
          intensity={50}
          tint={isDark ? "dark" : "light"}
          style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: isDark ? "rgba(10,20,19,0.35)" : "rgba(255,255,255,0.72)" }}
        >
          <Text variant="footnote" weight="700">
            {text}
          </Text>
        </BlurView>
      </View>
    </Animated.View>
  );
}

/* ── the sheet ──────────────────────────────────────────────────────────── */

/** The plain half: rounded at the top, sliding up over the stage on arrival. */
function Sheet({ children, bottom }: { children: React.ReactNode; bottom: number }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const up = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      up.setValue(1);
      return;
    }
    Animated.spring(up, { toValue: 1, useNativeDriver: false, speed: 9, bounciness: 6 }).start();
    // Never left half off the screen if the slide does not run.
    const safety = setTimeout(() => up.setValue(1), 1800);
    return () => clearTimeout(safety);
  }, [up, reduced]);
  return (
    <Animated.View
      style={{
        flexGrow: 1,
        marginTop: -28,
        backgroundColor: c.background,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: GUTTER + 4,
        paddingTop: space.md,
        paddingBottom: bottom,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -6 },
        transform: [{ translateY: up.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A way in, the same size and corners as Apple's. "plain" is a bordered
 * card for a provider; "tinted" is the app's own, in its colour.
 */
function WayIn({
  label,
  icon,
  onPress,
  loading,
  disabled,
  kind,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  kind: "plain" | "tinted";
}) {
  const c = useTheme();
  const tinted = kind === "tinted";
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      to={0.97}
      style={{
        height: BUTTON_H,
        borderRadius: BUTTON_R,
        borderWidth: tinted ? 0 : 1.5,
        borderColor: c.border,
        backgroundColor: tinted ? c.accentSoft : c.backgroundElement,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        marginBottom: space.sm,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={c.text} />
      ) : (
        <>
          {icon}
          <Text variant="headline" weight="700" style={{ color: tinted ? c.accent : c.text }}>
            {label}
          </Text>
        </>
      )}
    </PressScale>
  );
}

function EmailForm({
  mode,
  email,
  password,
  busy,
  setEmail,
  setPassword,
  switchMode,
  submit,
  forgot,
  back,
}: {
  mode: Mode;
  email: string;
  password: string;
  busy: boolean;
  setEmail: (s: string) => void;
  setPassword: (s: string) => void;
  switchMode: (m: Mode) => void;
  submit: () => void;
  forgot: () => void;
  back?: () => void;
}) {
  return (
    <Rise>
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
      <Button
        title={mode === "signin" ? "Sign in" : "Create account"}
        loading={busy}
        disabled={!email || password.length < (mode === "signup" ? MIN_PASSWORD : 1)}
        onPress={submit}
      />
      <View style={{ flexDirection: "row", justifyContent: back ? "space-between" : "center", marginTop: space.md }}>
        {back ? (
          <Pressable onPress={back} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Symbol name="chevron.left" size={12} weight="semibold" />
            <Text variant="footnote" tone="tint" weight="600">
              Other ways to continue
            </Text>
          </Pressable>
        ) : null}
        {mode === "signin" ? (
          <Pressable onPress={forgot} disabled={busy} hitSlop={10}>
            <Text variant="footnote" tone="tint" weight="600">
              Forgot password?
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Rise>
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
    Animated.timing(v, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => {
      setShown(word);
      v.setValue(-1);
      Animated.spring(v, { toValue: 1, useNativeDriver: false, speed: 16, bounciness: 8 }).start();
    });
  }, [word, shown, reduced, v]);

  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 0, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [18, -14, 0] }) }],
      }}
    >
      <Text variant="largeTitle" weight="800" style={{ color: c.accent, letterSpacing: -0.6 }}>
        {shown}
      </Text>
    </Animated.View>
  );
}

/** Sign in or create account, two halves with a thumb that slides between them. */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(mode === "signup" ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: mode === "signup" ? 1 : 0, useNativeDriver: false, speed: 18, bounciness: 6 }).start();
  }, [mode, x]);

  const half = Math.max(0, (width - 8) / 2);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: 46, borderRadius: 14, backgroundColor: c.backgroundSelected, padding: 4, flexDirection: "row" }}
    >
      {width ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            width: half,
            height: 38,
            borderRadius: 11,
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
          <Text variant="subheadline" weight="700" style={{ color: mode === m ? c.text : c.textSecondary }}>
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
      [10, -8, 6, -4, 0].map((to) => Animated.timing(x, { toValue: to, duration: 55, useNativeDriver: false }))
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
        marginBottom: space.md,
        padding: space.md,
        borderRadius: 14,
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
