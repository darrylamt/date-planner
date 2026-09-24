import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Symbol } from "../src/components/Symbol";
import { GUTTER, HAIRLINE, radius, space } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { ensureSession, useAuth } from "../src/lib/useAuth";
import { saveDraft } from "../src/lib/draft";
import { linksIn, type ChatLink } from "../src/lib/chatLinks";
import { Paywall } from "../src/components/chat/Paywall";
import { IssueSheet } from "../src/components/IssueSheet";
import { Toast } from "../src/components/Toast";
import {
  OutOfMessagesError,
  SignInRequiredError,
  fetchAllowance,
  fetchConversation,
  fetchLatestConversation,
  streamChat,
} from "../src/lib/chat";

/**
 * The concierge.
 *
 * It answers from the catalogue or it says we do not have it; there is no
 * third behaviour, and the server is what guarantees that rather than
 * anything here. This screen's job is to make waiting legible: a turn that
 * searches, reads a menu and checks the hours takes several seconds, and a
 * screen showing nothing for several seconds reads as broken.
 */
interface Bubble {
  role: "user" | "assistant";
  text: string;
}

const OPENERS = [
  "Where can I get good jollof under 100?",
  "Somewhere romantic in Osu for Saturday",
  "What can we do that isn't eating?",
  "I have 400 cedis for two. What's realistic?",
];

export default function ChatScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading } = useAuth();
  const user = session?.user ?? null;

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [allowance, setAllowance] = useState<Awaited<ReturnType<typeof fetchAllowance>>>(null);
  const [paywalled, setPaywalled] = useState(false);
  /*
   * The last thing that went wrong, and whether they have been offered the
   * chance to say so.
   *
   * Errors here arrive as ordinary assistant bubbles, which reads well and
   * leaves nothing to act on: the message that said a conversation had
   * confused the assistant was, for months, the end of the line. Holding on
   * to it means the report carries the exact sentence and the conversation
   * it came from, rather than "chat is broken".
   */
  const [lastError, setLastError] = useState<string | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /*
   * Set when a turn actually built something. Kept on the screen rather than
   * in the bubble, because the plan is a thing you go and look at, not a
   * paragraph: the assistant says what it made and this opens it.
   */
  const [plan, setPlan] = useState<{ title: string; total: number } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const scroller = useRef<ScrollView>(null);
  const toBottom = useCallback(() => {
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  }, []);

  // Reopen where they left off, so the tab is a conversation rather than a
  // blank box that forgets them between visits.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoadingHistory(false);
      return;
    }
    let active = true;
    void (async () => {
      const [id, allow] = await Promise.all([fetchLatestConversation(), fetchAllowance()]);
      if (!active) return;
      setAllowance(allow);
      if (id) {
        setConversationId(id);
        const past = await fetchConversation(id);
        if (active) setBubbles(past.map((m) => ({ role: m.role, text: m.text })));
      }
      if (active) setLoadingHistory(false);
    })();
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  /**
   * Wait for the entitlement to arrive, rather than assuming it already has.
   *
   * StoreKit returns the moment Apple takes the money, but the row the server
   * gates on is written by a webhook: Apple tells RevenueCat, RevenueCat calls
   * us, we write it. That is seconds, sometimes more. Refetching once on the
   * spot reads the state from before the purchase, so the screen unlocked and
   * the very next message hit the paywall again -- and it only came right
   * after closing and reopening the chat, by which time the webhook had
   * landed.
   *
   * So this asks repeatedly until the answer changes. Thirty seconds of
   * patience, then an honest sentence: the purchase is not lost, it just has
   * not reached us yet, and the next thing they send will work.
   */
  async function waitForPro() {
    // The same line the assistant uses while thinking, so the wait looks like
    // the app working rather than the app hanging.
    setStatus("Unlocking");
    for (let attempt = 0; attempt < 20; attempt++) {
      const next = await fetchAllowance();
      if (next) setAllowance(next);
      if (next?.tier === "pro") {
        setStatus(null);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setStatus(null);
    /*
     * Its own bubble rather than the streaming `push`, which belongs to a
     * send that is not happening. Said as a delay and not a failure, because
     * that is what it is: the money has gone, the grant is in flight, and the
     * next message will work.
     */
    setBubbles((b) => [
      ...b,
      {
        role: "assistant",
        text: "Your subscription is being confirmed by the App Store. That usually takes a few seconds — send that again in a moment.",
      },
    ]);
    toBottom();
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft("");
    setBubbles((b) => [...b, { role: "user", text: message }]);
    setBusy(true);
    setPlan(null);
    // Whatever went wrong last time is no longer what is on screen.
    setLastError(null);
    setStatus("Thinking");
    toBottom();

    // One assistant bubble, appended to as text events arrive. A turn can emit
    // prose, call a tool, then emit more; separate bubbles for each would read
    // as the assistant interrupting itself.
    let answer = "";
    const push = (chunk: string) => {
      answer = answer ? `${answer}\n\n${chunk}` : chunk;
      setBubbles((b) => {
        const next = [...b];
        if (next[next.length - 1]?.role === "assistant") next[next.length - 1] = { role: "assistant", text: answer };
        else next.push({ role: "assistant", text: answer });
        return next;
      });
      toBottom();
    };

    try {
      for await (const ev of streamChat({ message, conversationId })) {
        if (ev.type === "conversation") {
          setConversationId(ev.id);
          if (ev.tier === "free") {
            setAllowance({ tier: "free", remaining: ev.remaining, allowance: 5 });
          }
        } else if (ev.type === "plan") {
          /*
           * Straight into the draft, which is where /plan/new looks when it
           * opens. That screen already knows how to resume an itinerary, with
           * swapping, menus and saving intact, so the plan built here lands in
           * exactly the same place as one built from the questionnaire.
           */
          await saveDraft({ inputs: ev.inputs, itinerary: ev.itinerary, shareSlug: null });
          setPlan({ title: ev.itinerary.title, total: ev.itinerary.est_total_ghs });
        } else if (ev.type === "tool") {
          setStatus(ev.label);
        } else if (ev.type === "text") {
          setStatus(null);
          push(ev.text);
        } else if (ev.type === "error") {
          push(ev.message);
          setLastError(ev.message);
        }
      }
    } catch (e) {
      if (e instanceof SignInRequiredError) {
        router.push("/login");
      } else if (e instanceof OutOfMessagesError) {
        setPaywalled(true);
        // Take the optimistic bubble back: it was never sent or charged.
        setBubbles((b) => b.filter((_, i) => i !== b.length - 1));
      } else {
        push("We could not reach the assistant. Check your connection and try again.");
        setLastError((e as Error)?.message ?? "could not reach the assistant");
      }
    } finally {
      setBusy(false);
      setStatus(null);
      toBottom();
    }
  }

  if (authLoading || loadingHistory) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center" }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!user)
    return (
      <SignedOut
        onSignIn={() => router.push("/login")}
        onContinue={() => void ensureSession()}
      />
    );

  const empty = bubbles.length === 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      /*
       * The height of the navigation header above this view.
       *
       * KeyboardAvoidingView measures from the top of the window, not from the
       * top of its own frame, so with no offset it under-pads by exactly the
       * header and the composer sits behind the keyboard. Computed rather than
       * read from useHeaderHeight, which lives in a copy of
       * @react-navigation/elements that expo-router vendors and does not
       * re-export: 44 is the iOS navigation bar, and the inset is the notch
       * above it.
       */
      keyboardVerticalOffset={insets.top + 44}
    >
      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: space.lg,
          paddingHorizontal: GUTTER,
          paddingBottom: space.xl,
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={toBottom}
      >
        {bubbles.length === 0 && (
          <Text variant="footnote" tone="secondary" style={{ marginBottom: space.xl }}>
            Everything here comes from our own catalogue. If we do not hold it, it will say so.
          </Text>
        )}

        {empty ? (
          <View style={{ gap: space.sm }}>
            {OPENERS.map((o) => (
              <Pressable
                key={o}
                onPress={() => void send(o)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? c.backgroundSunken : c.backgroundElement,
                  borderRadius: radius.row,
                  paddingHorizontal: space.lg,
                  paddingVertical: space.md,
                  borderWidth: HAIRLINE,
                  borderColor: c.border,
                })}
              >
                <Text variant="body" tone="secondary">
                  {o}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          bubbles.map((b, i) => <BubbleView key={i} bubble={b} />)
        )}

        {status && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md }}>
            <ActivityIndicator size="small" color={c.textSecondary} />
            <Text variant="footnote" tone="secondary">
              {status}…
            </Text>
          </View>
        )}

        {plan && (
          <Pressable
            onPress={() => router.push("/plan/new")}
            style={({ pressed }) => ({
              marginTop: space.sm,
              marginBottom: space.md,
              alignSelf: "flex-start",
              maxWidth: "88%",
              backgroundColor: pressed ? c.backgroundSunken : c.accent,
              borderRadius: radius.card,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
            })}
          >
            <Symbol name="calendar" size={18} color={c.textOnBrand} />
            <View>
              <Text variant="body" tone="onTint">
                View plan
              </Text>
              <Text variant="caption1" tone="onTint">
                {plan.title} · GHS {plan.total}
              </Text>
            </View>
          </Pressable>
        )}

        {/*
          Offered only after something has actually failed.

          A permanent "report a problem" in a chat thread invites noise and
          reads as an app that expects to break. Appearing on the back of an
          error asks the one person who can describe it, at the one moment
          they can, and carries the sentence they just read with it.
        */}
        {lastError && !busy && !paywalled && (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setIssueOpen(true);
            }}
            hitSlop={8}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
              marginTop: space.xs,
              marginBottom: space.md,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Symbol name="exclamationmark.bubble" size={14} color={c.textSecondary} />
            <Text variant="footnote" tone="secondary">
              Tell us what went wrong
            </Text>
          </Pressable>
        )}

        {paywalled && (
          <Paywall
            tier={allowance?.tier ?? "free"}
            accountless={user?.is_anonymous === true}
            /*
             * Re-read rather than assume. The purchase told RevenueCat, which
             * tells Apple, which calls our webhook, which writes the row the
             * server actually gates on. Unlocking the screen locally would be
             * a paywall a rooted phone can talk its way past.
             */
            onPurchased={() => {
              setPaywalled(false);
              void waitForPro();
            }}
          />
        )}
      </ScrollView>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void send(draft)}
        busy={busy}
        disabled={paywalled}
        remaining={allowance?.tier === "free" ? allowance.remaining : null}
      />

      <IssueSheet
        visible={issueOpen}
        onClose={() => setIssueOpen(false)}
        onDone={setToast}
        area="chat"
        context={{
          conversationId,
          lastError: lastError ?? undefined,
          screen: "chat",
        }}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </KeyboardAvoidingView>
  );
}

function BubbleView({ bubble }: { bubble: Bubble }) {
  const c = useTheme();
  const mine = bubble.role === "user";

  /*
   * Only on the assistant's side. A number somebody typed themselves is one
   * they already have, and offering to dial it back at them is noise.
   */
  const links = mine ? [] : linksIn(bubble.text);

  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "88%",
        marginBottom: space.md,
        backgroundColor: mine ? c.accent : c.backgroundElement,
        borderRadius: radius.card,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
      }}
    >
      <Text variant="body" tone={mine ? "onTint" : "label"}>
        {bubble.text}
      </Text>

      {/*
        Under the words rather than woven through them. React Native cannot put
        a View inside a Text, so an inline icon would have to be an emoji or a
        glyph character, and neither takes the theme's colour or grows a tap
        target. A row underneath is tappable at a thumb's size and leaves the
        prose exactly as the model wrote it.
      */}
      {links.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: space.sm,
            marginTop: space.md,
          }}
        >
          {links.map((link) => (
            <ChatLinkChip key={link.href} link={link} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One tappable thing the assistant mentioned.
 *
 * Carries the value as written rather than a word like "Call", because the
 * number is the useful part: somebody who wants to ring from another phone
 * can read it off the chip, and somebody who wants to ring from this one taps
 * it. The icon says which kind of thing it is at a glance.
 */
function ChatLinkChip({ link }: { link: ChatLink }) {
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        link.kind === "phone" ? `Call ${link.label}` : `Open ${link.label} on Instagram`
      }
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        void Linking.openURL(link.href).catch(() => {
          // A simulator with no dialler, or Instagram not installed. Nothing
          // to recover, and a thrown promise here would take the screen down.
        });
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: space.md,
        height: 30,
        borderRadius: radius.pill,
        backgroundColor: c.backgroundSelected,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {link.kind === "phone" ? (
        <Symbol name="phone.fill" size={12} color={c.accent} weight="semibold" />
      ) : (
        <ChatInstagramGlyph color={c.accent} />
      )}
      <Text variant="footnote" weight="600" style={{ color: c.accent }}>
        {link.label}
      </Text>
    </Pressable>
  );
}

/**
 * The Instagram mark, drawn.
 *
 * SF Symbols carries no third-party logos and the app ships no icon font, so
 * the alternatives were a bundled PNG that cannot take the theme's colour or
 * three nested Views that can. A rounded square, a circle and a dot is the
 * whole mark, and at twelve points it is read by shape rather than by detail.
 */
function ChatInstagramGlyph({ color }: { color: string }) {
  const SIZE = 13;
  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: 4,
        borderWidth: 1.4,
        borderColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{ width: 5.5, height: 5.5, borderRadius: 3, borderWidth: 1.4, borderColor: color }}
      />
      <View
        style={{
          position: "absolute",
          top: 1.4,
          right: 1.4,
          width: 1.7,
          height: 1.7,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  busy,
  disabled,
  remaining,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  disabled: boolean;
  remaining: number | null;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const ready = value.trim().length > 0 && !busy && !disabled;

  return (
    <View
      style={{
        paddingHorizontal: GUTTER,
        paddingTop: space.sm,
        paddingBottom: insets.bottom + space.md,
        borderTopWidth: HAIRLINE,
        borderTopColor: c.border,
        backgroundColor: c.background,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          placeholder={disabled ? "You have used your free messages" : "Ask about a place, a dish, a plan…"}
          placeholderTextColor={c.textSecondary}
          multiline
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            backgroundColor: c.backgroundElement,
            borderRadius: radius.row,
            paddingHorizontal: space.lg,
            paddingTop: space.md,
            paddingBottom: space.md,
            color: c.text,
            fontSize: 17,
          }}
        />
        <Pressable
          onPress={onSend}
          disabled={!ready}
          accessibilityLabel="Send"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ready ? c.accent : c.backgroundSunken,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={c.textSecondary} />
          ) : (
            <Symbol name="arrow.up" size={20} color={ready ? c.textOnBrand : c.textSecondary} />
          )}
        </Pressable>
      </View>

      {remaining !== null && (
        <Text variant="caption1" tone="tertiary" style={{ marginTop: space.xs }}>
          {remaining > 0
            ? `${remaining} free ${remaining === 1 ? "message" : "messages"} left`
            : "No free messages left"}
        </Text>
      )}
    </View>
  );
}

/**
 * The door to the assistant for somebody without a session.
 *
 * It used to be a wall: "Sign in to ask". App Review rejected that under
 * 5.1.1(v), because the assistant is what Pro sells and Pro is not
 * account-based, so registration has to be optional. Continuing makes an
 * account-less session on the spot; signing in stays available for anybody
 * who wants their chats and subscription on another device.
 */
function SignedOut({ onSignIn, onContinue }: { onSignIn: () => void; onContinue: () => void }) {
  const c = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: GUTTER,
        gap: space.md,
      }}
    >
      <Symbol name="bubble.left.and.bubble.right.fill" size={40} color={c.textSecondary} />
      <Text variant="title3" center>
        Ask adurobot
      </Text>
      <Text variant="footnote" tone="secondary" center>
        No account needed. Sign in if you want your chats and any subscription on your other
        devices too.
      </Text>
      <Pressable
        onPress={onContinue}
        style={{
          marginTop: space.sm,
          backgroundColor: c.accent,
          borderRadius: radius.row,
          paddingHorizontal: space.xl,
          paddingVertical: space.md,
        }}
      >
        <Text variant="body" tone="onTint">
          Continue without an account
        </Text>
      </Pressable>
      <Pressable onPress={onSignIn} hitSlop={8}>
        <Text variant="footnote" weight="600" style={{ color: c.accent }}>
          Sign in instead
        </Text>
      </Pressable>
    </View>
  );
}
