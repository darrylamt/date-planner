import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import {
  configurePurchases,
  fetchOffer,
  purchase,
  purchasesAvailable,
  restore,
  type Offer,
} from "../../lib/purchases";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/**
 * What somebody sees when the month's messages are gone.
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
        No account needed to subscribe. Create one any time to keep aduro Pro on your other
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
   * should not be told they have.
   */
  reason?: "limit" | "browse";
  /** Shown to somebody without an account: registering is optional. */
  accountless?: boolean;
}) {
  const c = useTheme();
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
        <Text variant="headline" style={{ marginBottom: space.xs }}>
          That is this month&apos;s allowance
        </Text>
        <Text variant="footnote" tone="secondary">
          Your messages reset at the start of next month. Planning from the questionnaire is
          unaffected and always has been.
        </Text>
      </Card>
    );
  }

  const say = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(null), 4000);
  };

  async function buy() {
    if (!offer) return;
    setBusy("buy");
    const result = await purchase(offer);
    setBusy(null);

    if (result === "bought") {
      /*
       * The app does not unlock itself here. RevenueCat has told Apple, Apple
       * will tell the webhook, and the webhook writes the entitlement the
       * server actually reads. This only asks the screen to look again.
       */
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
      say("No subscription found on this Apple ID.");
    } else {
      say("Could not reach the store just now.");
    }
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Symbol name="sparkles" size={18} color={c.accent} />
        <Text variant="headline" style={{ flex: 1 }}>
          {reason === "limit"
            ? "That was your last free message"
            : "Never spend 30 minutes figuring out where to go again."}
        </Text>
      </View>

      {/*
        The pitch, in the words people actually use for the problem. What Pro
        sells is the half hour of scrolling Instagram and asking the group chat,
        not a message count; the count follows as the fact behind it.
      */}
      {reason === "limit" ? (
        <Text variant="subheadline" weight="600" style={{ marginTop: space.sm }}>
          Never spend 30 minutes figuring out where to go again.
        </Text>
      ) : null}

      <Text variant="footnote" tone="secondary" style={{ marginTop: space.xs }}>
        Tell adurobot what you want and it plans it, answers questions about any place we
        know, and tells you what to order when you get there. Free accounts get five messages
        a month; aduro Pro lifts that to 150.
      </Text>

      {/*
        The line that keeps somebody who will not pay. The questionnaire is the
        product's promise and it is not what is being sold here.
      */}
      <Text variant="footnote" tone="secondary" style={{ marginTop: space.sm }}>
        Planning an evening from the questionnaire stays free and unlimited, with or without this.
      </Text>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: space.lg }} />
      ) : offer ? (
        <>
          <Pressable
            onPress={() => void buy()}
            disabled={busy !== null}
            style={({ pressed }) => ({
              marginTop: space.lg,
              backgroundColor: c.accent,
              borderRadius: radius.row,
              paddingVertical: space.md,
              alignItems: "center",
              opacity: pressed || busy ? 0.7 : 1,
            })}
          >
            <Text variant="headline" tone="onTint">
              {busy === "buy"
                ? "One moment…"
                : offer.trialDays > 0
                  ? `Try ${offer.trialDays} day${offer.trialDays === 1 ? "" : "s"} free`
                  : `Subscribe, ${offer.priceString}`}
            </Text>
          </Pressable>

          {/*
            The renewal terms, in the sentence rather than in a link. This is
            the specific thing 3.1.2 is about: the length, the price, and that
            it continues until cancelled, all visible without tapping anything.
          */}
          <Text variant="caption1" tone="tertiary" center style={{ marginTop: space.sm }}>
            {offer.trialDays > 0
              ? `${offer.trialDays} day${offer.trialDays === 1 ? "" : "s"} free, then ${offer.priceString} per ${offer.period}. `
              : `${offer.priceString} per ${offer.period}. `}
            Renews automatically until cancelled. Cancel any time in your Apple ID settings.
          </Text>
        </>
      ) : (
        <Text variant="footnote" tone="secondary" style={{ marginTop: space.lg }}>
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
        <Pressable onPress={() => void restorePurchases()} disabled={busy !== null}>
          <Text variant="caption1" weight="600" style={{ color: c.accent }}>
            {busy === "restore" ? "Checking…" : "Restore Purchases"}
          </Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(`${WEB_URL}/terms`)}>
          <Text variant="caption1" weight="600" style={{ color: c.accent }}>
            Terms
          </Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)}>
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
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View
      style={{
        marginTop: space.lg,
        padding: space.lg,
        borderRadius: radius.card,
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
      }}
    >
      {children}
    </View>
  );
}
