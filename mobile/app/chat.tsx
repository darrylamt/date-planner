import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { useAuth } from "../src/lib/useAuth";
import { saveDraft } from "../src/lib/draft";
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

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft("");
    setBubbles((b) => [...b, { role: "user", text: message }]);
    setBusy(true);
    setPlan(null);
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

  if (!user) return <SignedOut onSignIn={() => router.push("/login")} />;

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

        {paywalled && <Paywall tier={allowance?.tier ?? "free"} />}
      </ScrollView>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void send(draft)}
        busy={busy}
        disabled={paywalled}
        remaining={allowance?.tier === "free" ? allowance.remaining : null}
      />
    </KeyboardAvoidingView>
  );
}

function BubbleView({ bubble }: { bubble: Bubble }) {
  const c = useTheme();
  const mine = bubble.role === "user";

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
 * Shown when the allowance runs out. Says what it is rather than selling:
 * there is nothing to buy yet, and pretending otherwise would be worse than
 * saying so.
 */
function Paywall({ tier }: { tier: "free" | "pro" }) {
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
      <Text variant="headline" style={{ marginBottom: space.xs }}>
        {tier === "pro" ? "That is this month's allowance" : "That was your last free message"}
      </Text>
      <Text variant="footnote" tone="secondary">
        {tier === "pro"
          ? "Your messages reset at the start of next month. Planning a date from the questionnaire is unaffected."
          : "Planning a date from the questionnaire stays free and unlimited. A subscription for unlimited chat is coming."}
      </Text>
    </View>
  );
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
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
        Sign in to ask
      </Text>
      <Text variant="footnote" tone="secondary" center>
        Chat is tied to your account so we can remember what you asked and keep your free messages.
      </Text>
      <Pressable
        onPress={onSignIn}
        style={{
          marginTop: space.sm,
          backgroundColor: c.accent,
          borderRadius: radius.row,
          paddingHorizontal: space.xl,
          paddingVertical: space.md,
        }}
      >
        <Text variant="body" tone="onTint">
          Sign in
        </Text>
      </Pressable>
    </View>
  );
}
