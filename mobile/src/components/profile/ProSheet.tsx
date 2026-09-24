import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { AccountlessNote, Paywall } from "../chat/Paywall";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { configurePurchases, restore, purchasesAvailable } from "../../lib/purchases";

/** Where iOS keeps subscriptions. The only place one can be cancelled. */
const MANAGE_URL = "itms-apps://apps.apple.com/account/subscriptions";

/**
 * aduro Pro, reachable on purpose rather than by running out.
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
      setNote("No subscription found on this Apple ID.");
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
          <Text variant="headline">aduro Pro</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Symbol name="xmark.circle.fill" size={28} color={c.textTertiary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: GUTTER, paddingBottom: insets.bottom + space.xl }}
        >
          {tier === "pro" ? (
            <View>
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: space.lg,
                  borderRadius: radius.card,
                  backgroundColor: c.backgroundElement,
                }}
              >
                <Symbol name="checkmark.seal.fill" size={40} color={c.accent} />
                <Text variant="headline" center style={{ marginTop: space.md }}>
                  You are subscribed
                </Text>
                <Text
                  variant="footnote"
                  tone="secondary"
                  center
                  style={{ marginTop: space.xs, paddingHorizontal: space.lg }}
                >
                  The assistant is yours to use. Planning from the questionnaire is free and
                  always has been.
                </Text>
              </View>

              <Pressable
                onPress={() => void Linking.openURL(MANAGE_URL)}
                style={{ marginTop: space.lg, paddingVertical: space.md }}
              >
                <Text variant="body" center style={{ color: c.accent }}>
                  Manage or cancel in the App Store
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void restorePurchases()}
                disabled={busy}
                style={{ paddingVertical: space.sm }}
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
    </Modal>
  );
}
