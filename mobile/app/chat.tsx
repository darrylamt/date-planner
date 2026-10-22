import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Text } from "../src/components/Text";
import { Symbol } from "../src/components/Symbol";
import { GUTTER, HAIRLINE, radius, space } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { STORE } from "../src/lib/store";
import { useSeason } from "../src/lib/season";
import { SWEETS, useBurst } from "../src/components/Burst";
import { startListening, voiceAvailable } from "../src/lib/voice";
import { ensureSession, useAuth } from "../src/lib/useAuth";
import { saveDraft } from "../src/lib/draft";
import { linksIn, type ChatLink } from "../src/lib/chatLinks";
import { Paywall } from "../src/components/chat/Paywall";
import { ChatText } from "../src/components/chat/ChatText";
import { IssueSheet } from "../src/components/IssueSheet";
import { Toast } from "../src/components/Toast";
import { AiConsentSheet } from "../src/components/AiConsentSheet";
import { getAiConsent, setAiConsent } from "../src/lib/aiConsent";
import {
  OutOfMessagesError,
  SignInRequiredError,
  fetchAllowance,
  fetchConversation,
  fetchLatestConversation,
  streamChat,
} from "../src/lib/chat";
import { SkeletonChat } from "../src/components/Skeleton";
import { Mascot } from "../src/components/Mascot";
import { Rise, useReducedMotion } from "../src/components/motion";
import { useOccasionHue } from "../src/lib/useTheme";

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
  /** When it was said, for the day dividers. Missing on a bubble from an older reply. */
  at?: string;
  /** Arrived while the screen was open, so it rises in rather than just appearing. */
  fresh?: boolean;
}

/** Durobot's face: the mascot on its own (the suited costume is two people). */
const DUROBOT = "solo_day" as const;

/*
 * The best things to ask, as the first thing on the screen.
 *
 * Each one is a different job, so between them they show the range: a menu
 * question, a plan, an activity, a budget check, and standing in a
 * restaurant not knowing what to get, which is the one people do not think
 * to ask a planning app and is the most useful thing it does at the table.
 * The last opener is a draft rather than a question: it goes into the
 * composer for them to finish, because only they know where they are.
 */
const OPENERS: { text: string; icon: Parameters<typeof Symbol>[0]["name"] }[] = [
  { text: "Somewhere romantic in Osu for Saturday", icon: "heart.fill" },
  { text: "Where can I get good jollof under 100?", icon: "fork.knife" },
  { text: "What's showing at Silverbird this week?", icon: "film" },
  { text: "What can we do that isn't eating?", icon: "figure.walk" },
  { text: "I have 400 cedis for two. What's realistic?", icon: "banknote" },
];
const AT_THE_TABLE = "I'm at ";

/** At Halloween, openers for the season: still things the catalogue can answer. */
const HALLOWEEN_OPENERS: typeof OPENERS = [
  { text: "Anything on for Halloween this weekend?", icon: "sparkles" },
  { text: "A horror film and dinner after", icon: "film" },
  { text: "A spooky night out for four, under 1,500", icon: "person.3.fill" },
  { text: "Somewhere lively in Osu for Halloween", icon: "music.note" },
];
/** "Trick or treat", and the ways people actually type it. */
const TRICK_OR_TREAT = /trick\s*(or|'?r|n|&)\s*treat/i;

export default function ChatScreen() {
  const c = useTheme();
  const { season } = useSeason();
  const burst = useBurst();
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
  const [askingConsent, setAskingConsent] = useState(false);
  const consentAnswer = useRef<((allowed: boolean) => void) | null>(null);
  const composer = useRef<TextInput | null>(null);
  /*
   * Set when a turn actually built something. Kept on the screen rather than
   * in the bubble, because the plan is a thing you go and look at, not a
   * paragraph: the assistant says what it made and this opens it.
   */
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const scroller = useRef<ScrollView>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
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
        if (active) setBubbles(past.map((m) => ({ role: m.role, text: m.text, at: m.at })));
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
        text: `Your subscription is being confirmed by ${STORE}. That usually takes a few seconds — send that again in a moment.`,
      },
    ]);
    toBottom();
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    // An easter egg for the season: sweets from the send button, then Durobot plays along.
    if (season === "halloween" && TRICK_OR_TREAT.test(message)) {
      const { width, height } = Dimensions.get("window");
      /*
       * From above the keyboard when it is up. The burst layer is in the app's
       * window and the keyboard is in its own, over it, so sweets thrown from
       * where the send button sits with the keyboard down landed under it and
       * nobody saw a thing.
       */
      const floor = Keyboard.metrics()?.height ?? insets.bottom;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      burst(width - 44, height - floor - 60, SWEETS, 18, 30);
    }

    /*
     * Every send until it is allowed, unlike plans. The assistant is the
     * model, so a "no" here means the message is not sent at all, and asking
     * again when somebody next tries to send is asking at the one moment the
     * question means something.
     */
    if ((await getAiConsent()) !== "granted") {
      const allowed = await new Promise<boolean>((resolve) => {
        consentAnswer.current = resolve;
        setAskingConsent(true);
      });
      await setAiConsent(allowed ? "granted" : "declined");
      if (!allowed) return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft("");
    setBubbles((b) => [...b, { role: "user", text: message, at: new Date().toISOString(), fresh: true }]);
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
        const at = new Date().toISOString();
        if (next[next.length - 1]?.role === "assistant") next[next.length - 1] = { ...next[next.length - 1], text: answer };
        else next.push({ role: "assistant", text: answer, at, fresh: true });
        return next;
      });
      toBottom();
    };

    try {
      for await (const ev of streamChat({ message, conversationId, season })) {
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
          // Counted as a plan from chat (0085).
          await saveDraft({ inputs: { ...ev.inputs, entry: "chat" }, itinerary: ev.itinerary, shareSlug: null });
          setPlan({
            title: ev.itinerary.title,
            total: ev.itinerary.est_total_ghs,
            budget: ev.inputs.budget,
            stops: ev.itinerary.stops.length,
            image: ev.itinerary.stops.find((s) => s.image_url)?.image_url ?? null,
            route: ev.itinerary.summary_route,
          });
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
      <SkeletonChat />
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
      <Stack.Screen options={{ headerTitle: () => <ChatTitle />, headerRight: () => null }} />
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
        scrollEventThrottle={64}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          setAwayFromBottom(contentSize.height - contentOffset.y - layoutMeasurement.height > 320);
        }}
      >
        {empty ? (
          <Welcome
            openers={season === "halloween" ? HALLOWEEN_OPENERS : OPENERS}
            onAsk={(o) => void send(o)}
            onAtTheTable={() => {
              setDraft(`${AT_THE_TABLE}`);
              setTimeout(() => composer.current?.focus(), 50);
            }}
          />
        ) : (
          bubbles.map((b, i) => {
            const prev = bubbles[i - 1];
            const next = bubbles[i + 1];
            const day = dayOf(b.at);
            const newDay = Boolean(day && day !== dayOf(prev?.at));
            return (
              <View key={i}>
                {newDay ? <DayDivider iso={b.at!} /> : null}
                <BubbleView
                  bubble={b}
                  // A run of messages from one side reads as one turn: close together, one face.
                  first={!prev || prev.role !== b.role || newDay}
                  last={!next || next.role !== b.role || Boolean(dayOf(next.at) && dayOf(next.at) !== day)}
                />
              </View>
            );
          })
        )}

        {status ? <TypingBubble status={status} /> : null}

        {plan ? <PlanCard plan={plan} onOpen={() => router.push("/plan/new")} /> : null}

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

      {/* Back to the newest message, after scrolling up through an old conversation. */}
      {awayFromBottom && !empty ? (
        <View pointerEvents="box-none" style={{ alignItems: "center", marginTop: -52, marginBottom: space.sm }}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              toBottom();
            }}
            accessibilityRole="button"
            accessibilityLabel="Jump to the latest message"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.backgroundElement,
              borderWidth: HAIRLINE,
              borderColor: c.border,
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Symbol name="arrow.down" size={16} color={c.text} />
          </Pressable>
        </View>
      ) : null}

      <Composer
        inputRef={composer}
        value={draft}
        onChange={setDraft}
        onSend={() => void send(draft)}
        busy={busy}
        disabled={paywalled}
        remaining={allowance?.tier === "free" ? allowance.remaining : null}
        onVoiceError={setToast}
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

      <AiConsentSheet
        purpose={askingConsent ? "chat" : null}
        onAnswer={(allowed) => {
          setAskingConsent(false);
          consentAnswer.current?.(allowed);
          consentAnswer.current = null;
        }}
      />
    </KeyboardAvoidingView>
  );
}

type PlanPreview = { title: string; total: number; budget: number; stops: number; image: string | null; route: string };

/**
 * One message, as part of a run.
 *
 * Shaped like the chats people already know: a run of messages from one side
 * sits close together, and only the last of a run tapers towards its sender
 * and, on Durobot's side, carries its face. Durobot's words sit on a card
 * with a fine edge; theirs are in the brand colour. New ones rise in.
 */
function BubbleView({ bubble, first, last }: { bubble: Bubble; first: boolean; last: boolean }) {
  const c = useTheme();
  const mine = bubble.role === "user";
  const R = 20;
  const TIGHT = 6;

  /*
   * Only on the assistant's side. A number somebody typed themselves is one
   * they already have, and offering to dial it back at them is noise.
   */
  const links = mine ? [] : linksIn(bubble.text);

  const body = (
    <View
      style={{
        maxWidth: mine ? "82%" : "100%",
        flexShrink: 1,
        backgroundColor: mine ? c.accent : c.backgroundElement,
        borderWidth: mine ? 0 : HAIRLINE,
        borderColor: c.border,
        borderTopLeftRadius: !mine && !first ? TIGHT : R,
        borderBottomLeftRadius: !mine && last ? TIGHT : !mine ? TIGHT : R,
        borderTopRightRadius: mine && !first ? TIGHT : R,
        borderBottomRightRadius: mine && last ? TIGHT : mine ? TIGHT : R,
        paddingHorizontal: space.md + 2,
        paddingVertical: space.sm + 2,
      }}
    >
      {/* Their own words exactly as typed; ours with the formatting it asked for. */}
      {mine ? (
        // Selectable, so a long press offers Copy: their own words, to reuse or send on.
        <Text variant="body" tone="onTint" selectable>
          {bubble.text}
        </Text>
      ) : (
        <ChatText text={bubble.text} tone="label" />
      )}

      {/*
        Under the words rather than woven through them. React Native cannot put
        a View inside a Text, so an inline icon would have to be an emoji or a
        glyph character, and neither takes the theme's colour or grows a tap
        target. A row underneath is tappable at a thumb's size and leaves the
        prose exactly as the model wrote it.
      */}
      {links.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm }}>
          {links.map((link) => (
            <ChatLinkChip key={link.href} link={link} />
          ))}
        </View>
      ) : null}
    </View>
  );

  const row = (
    <View
      style={{
        flexDirection: "row",
        justifyContent: mine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: space.sm,
        marginBottom: last ? space.md : 3,
        // Durobot's runs line up behind its face, which only the last one shows.
        paddingRight: mine ? 0 : space.xl,
      }}
    >
      {mine ? null : last ? <DurobotFace /> : <View style={{ width: FACE }} />}
      {body}
    </View>
  );

  return bubble.fresh ? <Rise distance={10}>{row}</Rise> : row;
}

const FACE = 30;

/** Durobot's face: the mascot in its suit, on its own colour. */
function DurobotFace({ size = FACE }: { size?: number }) {
  const hue = useOccasionHue(DUROBOT);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: hue.bg,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Mascot occasion={DUROBOT} size={size * 0.95} animate={false} style={{ marginTop: size * 0.18 }} />
    </View>
  );
}

/** The header: who this is and what it is for, in place of a robot emoji. */
function ChatTitle() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <DurobotFace size={30} />
      <View>
        <Text variant="headline">Durobot</Text>
        <Text variant="caption1" tone="secondary">
          Plans nights out in Accra
        </Text>
      </View>
    </View>
  );
}

/**
 * Durobot typing: three dots in its own bubble, with what it is doing
 * underneath ("Checking menus"). It was a spinner and a line of grey text,
 * which read as the app loading rather than somebody answering. JS-driven,
 * like every animation here (native-driven ones stalled on the phone), and
 * still under Reduce Motion.
 */
function TypingBubble({ status }: { status: string }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1100, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [reduced, t]);
  const dot = (i: number) => ({
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.textSecondary,
    opacity: reduced
      ? 0.6
      : t.interpolate({
          inputRange: [0, 0.2 + i * 0.15, 0.45 + i * 0.15, 1],
          outputRange: [0.25, 0.9, 0.25, 0.25],
          extrapolate: "clamp",
        }),
  });
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, marginBottom: space.md }}>
      <DurobotFace />
      <View style={{ gap: 4 }}>
        <View
          accessibilityLabel={`${status}`}
          style={{
            flexDirection: "row",
            gap: 5,
            alignSelf: "flex-start",
            paddingHorizontal: space.md + 2,
            paddingVertical: space.md,
            backgroundColor: c.backgroundElement,
            borderWidth: HAIRLINE,
            borderColor: c.border,
            borderRadius: 20,
            borderBottomLeftRadius: 6,
          }}
        >
          {[0, 1, 2].map((i) => (
            <Animated.View key={i} style={dot(i)} />
          ))}
        </View>
        <Text variant="caption1" tone="tertiary">
          {status}…
        </Text>
      </View>
    </View>
  );
}

/**
 * The plan Durobot just built, as a card worth tapping: the first stop's
 * picture, the title, the shape of the evening and what it comes to against
 * the budget. It was a small "View plan" pill that looked like any other
 * button.
 */
function PlanCard({ plan, onOpen }: { plan: PlanPreview; onOpen: () => void }) {
  const c = useTheme();
  return (
    <Rise distance={12}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open plan: ${plan.title}, ${plan.stops} stops, GHS ${plan.total}`}
        style={({ pressed }) => ({
          marginLeft: FACE + space.sm,
          marginBottom: space.lg,
          maxWidth: 320,
          borderRadius: radius.card,
          overflow: "hidden",
          backgroundColor: c.backgroundElement,
          borderWidth: HAIRLINE,
          borderColor: c.border,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {plan.image ? (
          <Image source={{ uri: plan.image }} style={{ width: "100%", height: 120, backgroundColor: c.backgroundSunken }} contentFit="cover" />
        ) : null}
        <View style={{ padding: space.md + 2, gap: 2 }}>
          <Text variant="caption1" tone="tint" weight="700" style={{ letterSpacing: 0.6 }}>
            YOUR PLAN
          </Text>
          <Text variant="headline" numberOfLines={2}>
            {plan.title}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {plan.stops} stop{plan.stops === 1 ? "" : "s"}
            {plan.route ? ` · ${plan.route}` : ""}
          </Text>
          <Text variant="footnote" weight="600" style={{ color: plan.total > plan.budget ? c.danger : c.success, marginTop: 2 }}>
            GHS {plan.total} of your {plan.budget}
          </Text>
          <View
            style={{
              marginTop: space.sm,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: space.md,
              height: 34,
              borderRadius: radius.pill,
              backgroundColor: c.accent,
            }}
          >
            <Text variant="subheadline" weight="700" style={{ color: c.textOnBrand }}>
              Open plan
            </Text>
            <Symbol name="arrow.right" size={13} color={c.textOnBrand} weight="semibold" />
          </View>
        </View>
      </Pressable>
    </Rise>
  );
}

/**
 * The first screen of a new conversation: who Durobot is, then things to
 * ask, as chips, then the one people do not think to ask a planning app
 * (standing in a restaurant not knowing what to order), set apart.
 */
function Welcome({
  openers,
  onAsk,
  onAtTheTable,
}: {
  openers: typeof OPENERS;
  onAsk: (text: string) => void;
  onAtTheTable: () => void;
}) {
  const c = useTheme();
  const hue = useOccasionHue(DUROBOT);
  return (
    <View style={{ gap: space.lg, paddingTop: space.md }}>
      <View style={{ alignItems: "center", gap: space.sm }}>
        <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: hue.bg, alignItems: "center", justifyContent: "center" }}>
          <Mascot occasion={DUROBOT} size={84} />
        </View>
        <Text variant="title2" center>
          Hi, I&apos;m Durobot
        </Text>
        <Text variant="subheadline" tone="secondary" center style={{ maxWidth: 300 }}>
          Ask me where to go, what to order or what&apos;s on. I only talk about places Duro! knows, with real prices.
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {openers.map((o) => (
          <Pressable
            key={o.text}
            onPress={() => onAsk(o.text)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm + 2,
              borderRadius: radius.pill,
              backgroundColor: pressed ? c.backgroundSunken : c.backgroundElement,
              borderWidth: HAIRLINE,
              borderColor: c.border,
            })}
          >
            <Symbol name={o.icon} size={14} color={c.accent} />
            <Text variant="subheadline">{o.text}</Text>
          </Pressable>
        ))}
      </View>

      {/*
        Started for them rather than sent, because the one word that matters
        is where they are. The cursor lands after "I'm at " and the keyboard
        is already up.
      */}
      <Pressable
        onPress={onAtTheTable}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          padding: space.md + 2,
          borderRadius: radius.card,
          backgroundColor: c.accentSoft,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
          <Symbol name="fork.knife" size={17} color={c.textOnBrand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headline">At a restaurant now?</Text>
          <Text variant="footnote" tone="secondary">
            Tell me where, and I&apos;ll say what to order from their menu.
          </Text>
        </View>
        <Symbol name="chevron.right" size={14} color={c.accent} weight="semibold" />
      </Pressable>
    </View>
  );
}

/** "Today", "Yesterday" or "Mon 19 Oct", between days in a long conversation. */
function DayDivider({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const label = same(d, today)
    ? "Today"
    : same(d, y)
      ? "Yesterday"
      : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <Text variant="caption1" tone="tertiary" center style={{ marginVertical: space.md }}>
      {label}
    </Text>
  );
}

/** The calendar day of a timestamp, to tell when one changes. */
function dayOf(iso: string | undefined): string | null {
  return iso ? new Date(iso).toDateString() : null;
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
  inputRef,
  onVoiceError,
}: {
  inputRef?: React.RefObject<TextInput | null>;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  disabled: boolean;
  remaining: number | null;
  onVoiceError: (message: string) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const ready = value.trim().length > 0 && !busy && !disabled;

  /*
   * Hold to talk, where the send arrow is while the box is empty, as
   * Messages does it. The words land in the box as they are said and stay
   * there when the mic is let go, to be read and sent, or corrected first:
   * a message is a Durobot message spent, and a mishearing should not cost
   * one. Anything already typed stays, with the speech after it.
   */
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const heldRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const showMic = voiceAvailable() && !disabled && !busy && (listening || value.trim().length === 0);

  useEffect(() => {
    if (!listening) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 420, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  async function holdToTalk() {
    heldRef.current = true;
    const before = value.trim();
    const stop = await startListening({
      onText: (said) => onChange(before ? `${before} ${said}` : said),
      onEnd: () => setListening(false),
      onError: (m) => {
        setListening(false);
        onVoiceError(m);
      },
    });
    if (!stop) return;
    // Let go while permission was still being asked: stop at once.
    if (!heldRef.current) {
      stop();
      return;
    }
    stopRef.current = stop;
    setListening(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function letGo() {
    heldRef.current = false;
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  }

  return (
    <View
      style={{
        paddingHorizontal: GUTTER,
        paddingTop: space.sm,
        paddingBottom: insets.bottom + space.sm,
        backgroundColor: c.background,
      }}
    >
      {remaining !== null ? (
        <View
          style={{
            alignSelf: "center",
            marginBottom: space.sm,
            paddingHorizontal: space.md,
            paddingVertical: 3,
            borderRadius: radius.pill,
            backgroundColor: remaining > 0 ? c.backgroundSunken : c.accentSoft,
          }}
        >
          <Text variant="caption1" weight="600" tone={remaining > 0 ? "secondary" : "tint"}>
            {remaining > 0 ? `${remaining} free ${remaining === 1 ? "message" : "messages"} left` : "No free messages left"}
          </Text>
        </View>
      ) : null}

      {/* One pill: the words, then the mic or the send button inside it. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: space.xs,
          minHeight: 48,
          paddingLeft: space.lg,
          paddingRight: 5,
          paddingVertical: 5,
          borderRadius: 24,
          backgroundColor: c.backgroundElement,
          borderWidth: HAIRLINE,
          borderColor: c.border,
        }}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          placeholder={disabled ? "You have used your free messages" : listening ? "Listening…" : "Ask Durobot anything…"}
          placeholderTextColor={c.textSecondary}
          multiline
          style={{
            flex: 1,
            maxHeight: 120,
            paddingTop: 9,
            paddingBottom: 9,
            color: c.text,
            fontSize: 17,
          }}
        />
        {showMic ? (
          <Pressable
            onPressIn={() => void holdToTalk()}
            onPressOut={letGo}
            accessibilityLabel="Hold to talk to Durobot"
            accessibilityHint="Keep holding while you speak, then let go"
            hitSlop={6}
          >
            <Animated.View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: listening ? c.danger : "transparent",
                transform: [{ scale: pulse }],
              }}
            >
              <Symbol name={listening ? "waveform" : "mic.fill"} size={18} color={listening ? "#FFFFFF" : c.textSecondary} />
            </Animated.View>
          </Pressable>
        ) : (
          <Pressable
            onPress={onSend}
            disabled={!ready}
            accessibilityLabel="Send"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: ready ? c.accent : c.backgroundSunken,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={c.textSecondary} />
            ) : (
              <Symbol name="arrow.up" size={18} color={ready ? c.textOnBrand : c.textSecondary} weight="semibold" />
            )}
          </Pressable>
        )}
      </View>
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
        Ask Duro!
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
