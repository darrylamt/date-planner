import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, View } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Mascot } from "../Mascot";
import { PressScale, Rise, useReducedMotion } from "../motion";
import { HAIRLINE, radius, space } from "../../theme";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { CANCEL_SHORT, STORE_ACCOUNT } from "../../lib/store";
import {
  configurePurchases,
  fetchOffer,
  purchase,
  purchasesAvailable,
  restore,
  type Offer,
} from "../../lib/purchases";
import type { SymbolViewProps } from "expo-symbols";
import { SkeletonOffer } from "../Skeleton";
import { MENUS_FREE_LABEL, menusFree } from "../../lib/freeMenus";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Pro's colours: the gold of the Pro star, with the sign-in screen's coral. */
const GOLD = "#E5B04E";
const GOLD_DEEP = "#C98E1E";
const CORAL = "#E4572E";
const ON_GOLD = "#1C1216";

/**
 * What somebody sees when the month's messages are gone, when they open Pro,
 * or when a venue page stops at its photos.
 *
 * ── the four things App Review looks for ────────────────────────────────
 * Guideline 3.1.2 rejects paywalls that leave any of these out, and all four
 * are here because all four are also just honest:
 *
 *   1. the price, as the store states it, never a figure typed in here
 *   2. the length of a period and that it renews by itself
 *   3. Restore Purchases, reachable without buying anything first
 *   4. links to Terms and Privacy
 *
 * ── and one thing it does not require ───────────────────────────────────
 * The sentence saying the questionnaire stays free. It is the most important
 * line on the screen: somebody who has just hit a wall needs to know the thing
 * they actually came for is not behind it, and a paywall that lets them
 * believe otherwise sells one subscription and loses the user.
 *
 * ── the look ─────────────────────────────────────────────────────────────
 * Pro is the gold star on the avatar, so the paywall wears it: a header of
 * gold, coral and the app's teal blurred together, the star popping in, and
 * what Pro gives listed plainly rather than sold. The button is gold with a
 * slow shine across it. Every claim on it is something Pro actually unlocks.
 */
/**
 * The sentence App Review asked for, and the way in it points to.
 *
 * 5.1.1(v): registration must be optional, and the app may explain that
 * registering keeps the purchase on the person's other devices, as long as it
 * offers a way to register at any time. That is exactly what this says.
 */
export function AccountlessNote() {
  const c = useTheme();
  return (
    <View style={{ marginTop: space.md, alignItems: "center" }}>
      <Text variant="footnote" tone="secondary" center>
        No account needed to subscribe. Create one any time to keep Duro Pro on your other
        devices.
      </Text>
      <Pressable onPress={() => router.push("/login")} hitSlop={8} style={{ marginTop: space.xs }}>
        <Text variant="footnote" weight="600" style={{ color: c.accent }}>
          Create an account
        </Text>
      </Pressable>
    </View>
  );
}

type Reason = "limit" | "browse" | "venue";

export type Perk = { icon: SymbolViewProps["name"]; title: string; body: string };

/** What Pro unlocks, and nothing it does not. */
export const PERKS: Record<"chat" | "venue" | "order", Perk> = {
  chat: {
    icon: "bubble.left.and.text.bubble.right.fill",
    title: "Plan by chatting with Durobot",
    body: "150 messages a month, against 5 on a free account. Ask about any place we know.",
  },
  venue: {
    icon: "menucard.fill",
    title: "Every venue's full page",
    // During the free month the list says so: a perk everybody has is not one to sell.
    body: menusFree()
      ? `The whole menu with prices, the week's hours, and booking. Free for everyone until ${MENUS_FREE_LABEL}, then with Pro.`
      : "The whole menu with prices, the week's hours, and Call, Book or WhatsApp in a tap.",
  },
  order: {
    icon: "fork.knife",
    title: "Know what to order",
    body: "Ask Durobot what is good there, and what fits your budget, when you arrive.",
  },
};

/** The headline, and the order of the perks, for why it is showing. */
const COPY: Record<Reason, { title: string; line: string; perks: (keyof typeof PERKS)[] }> = {
  limit: {
    title: "That was your last free message",
    line: "Never spend 30 minutes figuring out where to go again.",
    perks: ["chat", "order", "venue"],
  },
  browse: {
    title: "Never spend 30 minutes figuring out where to go again",
    line: menusFree() ? "Duro Pro plans with you, and keeps every place open after the free month." : "Duro Pro plans with you, and opens every place up.",
    perks: ["chat", "venue", "order"],
  },
  venue: {
    title: "See the whole page",
    line: "Menus, hours and booking for every place, with Duro Pro.",
    perks: ["venue", "chat", "order"],
  },
};

export function Paywall({
  tier,
  onPurchased,
  accountless = false,
  reason = "limit",
}: {
  tier: "free" | "pro";
  onPurchased: () => void;
  /**
   * Why this is showing. "limit" is the chat running out; "browse" is somebody
   * who opened Pro from their profile, who has not run out of anything and
   * should not be told they have; "venue" is a venue page past its photos.
   */
  reason?: Reason;
  /** Shown to somebody without an account: registering is optional. */
  accountless?: boolean;
}) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      await configurePurchases();
      const found = await fetchOffer();
      if (!active) return;
      setOffer(found);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  /*
   * A subscriber who has run through the fair-use cap is not being sold
   * anything. There is nothing to buy: they already bought it, and the count
   * resets. Showing them a price would be absurd.
   */
  if (tier === "pro") {
    return (
      <Card>
        <Hero title="That is this month's allowance" line="Your messages reset at the start of next month." reduced={reduced} />
        <View style={{ padding: space.lg }}>
          <Text variant="footnote" tone="secondary">
            Planning from the questionnaire is unaffected and always has been.
          </Text>
        </View>
      </Card>
    );
  }

  const copy = COPY[reason];

  const say = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(null), 4000);
  };

  async function buy() {
    if (!offer) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy("buy");
    const result = await purchase(offer);
    setBusy(null);

    if (result === "bought") {
      /*
       * The app does not unlock itself here. RevenueCat has told Apple, Apple
       * will tell the webhook, and the webhook writes the entitlement the
       * server actually reads. This only asks the screen to look again.
       */
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      say("Thank you. Unlocking now.");
      onPurchased();
      return;
    }
    if (result === "cancelled") return;
    say(
      result === "unavailable"
        ? "The store is not available in this build yet."
        : "That did not go through. Nothing has been charged."
    );
  }

  async function restorePurchases() {
    setBusy("restore");
    const result = await restore();
    setBusy(null);

    if (result === "restored") {
      say("Found it. Unlocking now.");
      onPurchased();
    } else if (result === "nothing") {
      say(`No subscription found on this ${STORE_ACCOUNT}.`);
    } else {
      say("Could not reach the store just now.");
    }
  }

  const trial = offer && offer.trialDays > 0 ? `${offer.trialDays} day${offer.trialDays === 1 ? "" : "s"}` : null;

  return (
    <Card>
      <Hero title={copy.title} line={copy.line} reduced={reduced} />

      <View style={{ padding: space.lg, paddingTop: space.md }}>
        {/* What it unlocks, plainly. */}
        <View style={{ gap: space.md }}>
          {copy.perks.map((key, i) => (
            <Rise key={key} delay={160 + i * 90} distance={10}>
              <PerkRow perk={PERKS[key]} />
            </Rise>
          ))}
        </View>

        {/*
          The line that keeps somebody who will not pay. The questionnaire is
          the product's promise and it is not what is being sold here.
        */}
        <View
          style={{
            flexDirection: "row",
            gap: space.sm,
            alignItems: "center",
            marginTop: space.lg,
            padding: space.md,
            borderRadius: radius.row,
            backgroundColor: c.backgroundSunken,
          }}
        >
          <Symbol name="checkmark.circle.fill" size={18} color={c.accent} />
          <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
            Planning from the questionnaire stays free and unlimited, with or without Pro.
          </Text>
        </View>

        {loading ? (
          <SkeletonOffer />
        ) : offer ? (
          <>
            {/* The price as the store states it, large, with what follows it. */}
            <View style={{ alignItems: "center", marginTop: space.xl }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
                <Text variant="title1" weight="800">
                  {trial ? "Free" : offer.intro ? offer.intro.priceString : offer.priceString}
                </Text>
                <Text variant="subheadline" tone="secondary">
                  {trial ? `for ${trial}` : offer.intro ? `for the first ${offer.intro.span}` : `per ${offer.period}`}
                </Text>
              </View>
              {trial || offer.intro ? (
                <Text variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
                  then {offer.priceString} per {offer.period}
                </Text>
              ) : null}
            </View>

            <BuyButton
              label={
                busy === "buy"
                  ? "One moment…"
                  : trial
                    ? `Try ${trial} free`
                    : offer.intro
                      ? `Subscribe, ${offer.intro.priceString} for the first ${offer.intro.span}`
                      : `Subscribe, ${offer.priceString}`
              }
              disabled={busy !== null}
              reduced={reduced}
              onPress={() => void buy()}
            />

            {/*
              The renewal terms, in the sentence rather than in a link. This is
              the specific thing 3.1.2 is about: the length, the price, and that
              it continues until cancelled, all visible without tapping anything.
            */}
            <Text variant="caption1" tone="tertiary" center style={{ marginTop: space.sm }}>
              {trial
                ? `${trial} free, then ${offer.priceString} per ${offer.period}. `
                : offer.intro
                  ? `${offer.intro.priceString} for the first ${offer.intro.span}, then ${offer.priceString} per ${offer.period}. `
                  : `${offer.priceString} per ${offer.period}. `}
              Renews automatically until cancelled. Cancel any time {CANCEL_SHORT}.
            </Text>
          </>
        ) : (
          <Text variant="footnote" tone="secondary" center style={{ marginTop: space.xl }}>
            {purchasesAvailable()
              ? "We could not reach the store just now. Try again in a moment."
              : "Subscriptions are not available in this build yet."}
          </Text>
        )}

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: space.lg,
            marginTop: space.lg,
            paddingTop: space.md,
            borderTopWidth: HAIRLINE,
            borderTopColor: c.border,
          }}
        >
          {/* Required, and reachable without buying anything first. */}
          <Pressable onPress={() => void restorePurchases()} disabled={busy !== null} hitSlop={8}>
            <Text variant="caption1" weight="600" style={{ color: c.accent }}>
              {busy === "restore" ? "Checking…" : "Restore Purchases"}
            </Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(`${WEB_URL}/terms`)} hitSlop={8}>
            <Text variant="caption1" weight="600" style={{ color: c.accent }}>
              Terms
            </Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)} hitSlop={8}>
            <Text variant="caption1" weight="600" style={{ color: c.accent }}>
              Privacy
            </Text>
          </Pressable>
        </View>

        {note ? (
          <Text variant="caption1" tone="secondary" center style={{ marginTop: space.sm }}>
            {note}
          </Text>
        ) : null}

        {accountless ? <AccountlessNote /> : null}
      </View>
    </Card>
  );
}

/**
 * Pro's header: its colours blurred together, the gold star, the character
 * celebrating, and why this is showing.
 */
/** Shared with the subscribed page, so having Pro looks like the thing that was bought. */
export function Hero({ title, line, reduced }: { title: string; line: string; reduced: boolean }) {
  const c = useTheme();
  const dark = useIsDark();
  const drift = useRef(new Animated.Value(0)).current;

  // Decoration only, so the native driver: if it never runs, the colours just sit still.
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, drift]);

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
        opacity: dark ? 0.6 : 0.9,
        transform: [
          { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
        ],
      }}
    />
  );

  return (
    <View style={{ overflow: "hidden", borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: dark ? "#1A1208" : "#FFF4E2" }}>
        {blob(GOLD, 220, -60, -80, 40, 30)}
        {blob(CORAL, 180, 150, -50, -30, 40)}
        {blob(c.accent, 160, 230, 60, -40, -20)}
        {blob(GOLD, 140, 60, 90, 30, -30)}
        <BlurView intensity={dark ? 60 : 50} tint={dark ? "dark" : "light"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", padding: space.lg, paddingBottom: space.md, minHeight: 150 }}>
        <View style={{ flex: 1, paddingRight: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Star reduced={reduced} />
            <Text variant="title3" weight="800" style={{ letterSpacing: -0.3 }}>
              Duro <Text variant="title3" weight="800" style={{ color: dark ? GOLD : GOLD_DEEP }}>Pro</Text>
            </Text>
          </View>
          <Text variant="headline" style={{ marginTop: space.md }}>
            {title}
          </Text>
          <Text variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
            {line}
          </Text>
        </View>
        <Mascot occasion="celebration" size={86} animate={!reduced} />
      </View>
    </View>
  );
}

/**
 * The gold star, as on a Pro avatar. Its arrival is on the JS driver with a
 * safety, because it is part of the header and must never be left hidden; the
 * twinkle is decoration on the native driver, on its own inner view.
 */
function Star({ reduced }: { reduced: boolean }) {
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      pop.setValue(1);
      return;
    }
    Animated.spring(pop, { toValue: 1, delay: 150, useNativeDriver: false, speed: 10, bounciness: 16 }).start();
    const safety = setTimeout(() => pop.setValue(1), 1500);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(twinkle, { toValue: 1, duration: 360, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      clearTimeout(safety);
      loop.stop();
    };
  }, [reduced, pop, twinkle]);

  return (
    <Animated.View
      style={{
        opacity: pop,
        transform: [
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
          { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) },
        ],
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: GOLD,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: GOLD_DEEP,
          shadowOpacity: 0.6,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Animated.View
          style={{
            transform: [
              { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) },
              { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "72deg"] }) },
            ],
          }}
        >
          <Symbol name="star.fill" size={14} weight="bold" color="#FFFFFF" />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** One thing Pro unlocks: an icon in a gold disc, what it is, and what that means. */
export function PerkRow({ perk }: { perk: Perk }) {
  const c = useTheme();
  const dark = useIsDark();
  return (
    <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: dark ? "rgba(229,176,78,0.18)" : "rgba(229,176,78,0.22)",
        }}
      >
        <Symbol name={perk.icon} size={18} color={dark ? GOLD : GOLD_DEEP} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="subheadline" weight="700">
          {perk.title}
        </Text>
        <Text variant="footnote" tone="secondary" style={{ marginTop: 1 }}>
          {perk.body}
        </Text>
      </View>
    </View>
  );
}

/** Gold, with a slow shine crossing it now and then. The shine is decoration. */
function BuyButton({
  label,
  disabled,
  reduced,
  onPress,
}: {
  label: string;
  disabled: boolean;
  reduced: boolean;
  onPress: () => void;
}) {
  const [width, setWidth] = useState(0);
  const shine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || width === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(shine, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, width, shine]);

  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ marginTop: space.lg, opacity: disabled ? 0.7 : 1 }}
    >
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          backgroundColor: GOLD,
          borderRadius: 999,
          paddingVertical: space.md + 2,
          paddingHorizontal: space.lg,
          alignItems: "center",
          overflow: "hidden",
          shadowColor: GOLD_DEEP,
          shadowOpacity: 0.45,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        {width > 0 && !reduced ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -20,
              bottom: -20,
              width: 56,
              backgroundColor: "rgba(255,255,255,0.45)",
              transform: [
                { translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-80, width + 20] }) },
                { rotate: "20deg" },
              ],
            }}
          />
        ) : null}
        <Text variant="headline" weight="800" center style={{ color: ON_GOLD }}>
          {label}
        </Text>
      </View>
    </PressScale>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View
      style={{
        marginTop: space.lg,
        borderRadius: radius.card,
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}
