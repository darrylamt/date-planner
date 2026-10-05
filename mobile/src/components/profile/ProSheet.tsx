import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { AccountlessNote, Card, Hero, PERKS, Paywall, PerkRow } from "../chat/Paywall";
import { useReducedMotion } from "../motion";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { configurePurchases, membership, restore, purchasesAvailable, type Membership } from "../../lib/purchases";
import { NativeSheet } from "../native/NativeSheet";
import { BILLER, MANAGE_URL, STORE, STORE_ACCOUNT } from "../../lib/store";


/**
 * Duro Pro, reachable on purpose rather than by running out.
 *
 * Until now the paywall had exactly one door: send five messages, be refused,
 * and it appears. That made the subscription unbuyable by anyone who simply
 * wanted it, and unreachable to App Review on any account that already had it
 * -- a reviewer signed in as a subscriber would have had to send a hundred and
 * fifty messages to find the thing they are required to test.
 *
 * So the state decides what this shows. Somebody who does not have it is sold
 * it, through the same Paywall the chat screen uses, which is the one that
 * carries the price, the renewal terms, Restore and the legal links. Somebody
 * who does have it is not sold anything -- they are told they have it and
 * shown where Apple lets them cancel, because a subscriber tapping their own
 * subscription is looking for the way out, and hiding it is how a cancellation
 * becomes a refund request.
 */
export function ProSheet({
  visible,
  onClose,
  tier,
  onPurchased,
  accountless = false,
}: {
  visible: boolean;
  onClose: () => void;
  tier: "free" | "pro";
  onPurchased: () => void;
  /** No account: say registering is optional, and offer it. */
  accountless?: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  // Renews, ends, or a payment problem, from Apple via RevenueCat. Null when it cannot be known here.
  const [member, setMember] = useState<Membership | null>(null);
  useEffect(() => {
    if (visible && tier === "pro") void membership().then(setMember);
  }, [visible, tier]);

  useEffect(() => {
    if (visible) void configurePurchases();
  }, [visible]);

  /*
   * Restore lives here too, not only on the paywall.
   *
   * Guideline 3.1.1 wants it reachable without buying anything first, and the
   * person who most needs it -- reinstalled the app, new phone, and the app
   * thinks they are free -- is looking in Profile, not in a paywall they
   * cannot make appear.
   */
  async function restorePurchases() {
    if (!purchasesAvailable()) {
      setNote("Subscriptions are not available in this build yet.");
      return;
    }
    setBusy(true);
    const found = await restore();
    setBusy(false);
    if (found) {
      setNote("Restored.");
      onPurchased();
    } else {
      setNote(`No subscription found on this ${STORE_ACCOUNT}.`);
    }
  }

  return (
    <NativeSheet visible={visible} onClose={onClose} detents={["large"]}>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: GUTTER,
            paddingVertical: space.md,
            borderBottomWidth: HAIRLINE,
            borderBottomColor: c.border,
          }}
        >
          {/* Not subscribed, the paywall's own header says it, and two would be one too many. */}
          <Text variant="headline">{tier === "pro" ? "Duro Pro" : ""}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: GUTTER, paddingBottom: insets.bottom + space.xl }}
        >
          {tier === "pro" ? (
            <View>
              {/*
                Having Pro looks like the thing that was bought: the paywall's
                own gold header, then what it gives, then where it stands with
                Apple. It was a grey tick and "You are subscribed", which told
                a subscriber nothing they were paying for.
              */}
              <Card>
                <Hero title="You have Duro Pro" line={standing(member)} reduced={reduced} />
                <View style={{ padding: space.lg, gap: space.lg }}>
                  {member?.billingIssue ? (
                    <Pressable
                      onPress={() => void Linking.openURL(MANAGE_URL)}
                      style={{
                        flexDirection: "row",
                        gap: space.sm,
                        alignItems: "center",
                        padding: space.md,
                        borderRadius: radius.row,
                        backgroundColor: c.dangerSoft,
                      }}
                    >
                      <Symbol name="exclamationmark.triangle.fill" size={16} color={c.danger} />
                      <Text variant="footnote" style={{ flex: 1, color: c.danger }}>
                        {BILLER} could not take the last payment. Tap to check your payment details.
                      </Text>
                    </Pressable>
                  ) : null}
                  <PerkRow perk={PERKS.chat} />
                  <PerkRow perk={PERKS.venue} />
                  <PerkRow perk={PERKS.order} />
                  <Text variant="footnote" tone="secondary">
                    Planning from the questionnaire is free for everyone, and always will be.
                  </Text>
                </View>
              </Card>

              <Pressable
                onPress={() => void Linking.openURL(MANAGE_URL)}
                style={({ pressed }) => ({
                  marginTop: space.lg,
                  paddingVertical: space.md,
                  borderRadius: radius.row,
                  alignItems: "center",
                  backgroundColor: c.backgroundElement,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text variant="body" weight="600" style={{ color: c.accent }}>
                  Manage or cancel in {STORE}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void restorePurchases()}
                disabled={busy}
                style={{ paddingVertical: space.md }}
              >
                <Text variant="footnote" tone="secondary" center>
                  {busy ? "Checking…" : "Restore purchases"}
                </Text>
              </Pressable>

              {note ? (
                <Text variant="footnote" tone="secondary" center style={{ marginTop: space.sm }}>
                  {note}
                </Text>
              ) : null}

              {/* Subscribed, with no account: the one thing worth offering. */}
              {accountless ? <AccountlessNote /> : null}
            </View>
          ) : (
            /*
             * The chat screen's paywall, unchanged. It already carries the
             * price as the store states it, the renewal terms, Restore and the
             * Terms and Privacy links, and duplicating any of that here would
             * be a second copy to keep honest.
             */
            <Paywall tier="free" reason="browse" onPurchased={onPurchased} accountless={accountless} />
          )}
        </ScrollView>
      </View>
    </NativeSheet>
  );
}

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/** Where the subscription stands, in a line. */
function standing(m: Membership | null): string {
  if (!m) return "Thank you for backing Duro!";
  if (m.billingIssue) return `${BILLER} is retrying your last payment.`;
  if (!m.until) return "Thank you for backing Duro!";
  if (!m.renews) return `Cancelled. You keep everything until ${day(m.until)}.`;
  return m.intro ? `Your first period ends ${day(m.until)}, then it renews.` : `Renews ${day(m.until)}.`;
}
