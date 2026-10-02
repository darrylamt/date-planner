import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View, type DimensionValue, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "./motion";
import { GUTTER, radius, space } from "../theme";
import { useTheme } from "../lib/useTheme";

/**
 * The shape of a screen before its content arrives.
 *
 * A spinner in the middle of an empty page says only "wait". A skeleton says
 * what is coming and where, so the page does not jump when it lands, and the
 * wait reads as shorter because something is already there. Every screen
 * that loads as a whole draws one of the layouts below; a spinner stays only
 * inside a button that is doing something.
 *
 * One pulse for the whole skeleton, so its blocks breathe together rather
 * than flicker out of step. Decoration, so the native driver, and still
 * under Reduce Motion. The blocks are backgroundSelected: the theme's own
 * `skeleton` grey is a photo's placeholder and in light mode sits too close
 * to the page to be seen at all.
 */
const Pulse = createContext<Animated.Value | null>(null);

export function Skeleton({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);

  return (
    <Pulse.Provider value={pulse}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={style}>
        {children}
      </View>
    </Pulse.Provider>
  );
}

/** One block of a skeleton. */
export function Bone({
  w = "100%",
  h = 14,
  r = 6,
  style,
}: {
  w?: DimensionValue;
  h?: number;
  r?: number;
  style?: ViewStyle;
}) {
  const c = useTheme();
  const pulse = useContext(Pulse);
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: c.backgroundSelected, opacity: pulse ?? 1 }, style]} />;
}

/** A page's worth, filling the screen in the page's colour. */
function Page({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Skeleton style={{ flex: 1, backgroundColor: c.background }}>{children}</Skeleton>;
}

/** Rows with a picture and two lines: the venues list, a menu, saved plans. */
export function SkeletonRows({ rows = 6, thumb = 64, inset = true }: { rows?: number; thumb?: number; inset?: boolean }) {
  return (
    <Skeleton style={{ paddingTop: space.sm }}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: inset ? GUTTER : 0, paddingVertical: space.sm }}
        >
          {thumb ? <Bone w={thumb} h={thumb} r={radius.row} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Bone w={`${70 - ((i * 13) % 30)}%`} h={16} />
            <Bone w={`${45 - ((i * 7) % 20)}%`} h={12} />
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

/** Saved plans: a date over a card of rows, twice. */
export function SkeletonSaved() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Page>
      <View style={{ paddingTop: insets.top + space.xxl, paddingHorizontal: GUTTER, gap: space.xl }}>
        <Bone w="40%" h={30} r={8} />
        {[0, 1].map((g) => (
          <View key={g} style={{ gap: space.sm }}>
            <Bone w="35%" h={12} />
            <View style={{ backgroundColor: c.backgroundElement, borderRadius: radius.card, padding: space.lg, gap: space.lg }}>
              <Bone w="75%" h={18} />
              <Bone w="55%" h={13} />
              <Bone w="65%" h={13} />
            </View>
          </View>
        ))}
      </View>
    </Page>
  );
}

/** A plan: its title, the budget bar, and stop cards with their pictures. */
export function SkeletonPlan() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Page>
      <View style={{ paddingTop: insets.top + space.xl, paddingHorizontal: GUTTER, gap: space.md }}>
        <Bone w="30%" h={12} />
        <Bone w="80%" h={28} r={8} />
        <Bone w="55%" h={14} />
        <Bone h={44} r={radius.card} style={{ marginTop: space.md }} />
        {[0, 1].map((s) => (
          <View key={s} style={{ marginTop: space.lg, backgroundColor: c.backgroundElement, borderRadius: radius.card, overflow: "hidden" }}>
            <Bone h={150} r={0} />
            <View style={{ padding: space.lg, gap: space.sm }}>
              <Bone w="25%" h={12} />
              <Bone w="60%" h={20} />
              <Bone w="85%" h={13} />
            </View>
          </View>
        ))}
      </View>
    </Page>
  );
}

/** A venue: the picture across the top, the name, what it is, then its rows. */
export function SkeletonVenue() {
  return (
    <Page>
      <Bone h={280} r={0} />
      <View style={{ paddingHorizontal: GUTTER, paddingTop: space.lg, gap: space.md }}>
        <Bone w="70%" h={28} r={8} />
        <Bone w="45%" h={14} />
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
          <Bone w={84} h={32} r={radius.pill} />
          <Bone w={96} h={32} r={radius.pill} />
          <Bone w={72} h={32} r={radius.pill} />
        </View>
        <Bone w="90%" h={13} style={{ marginTop: space.md }} />
        <Bone w="80%" h={13} />
      </View>
      <SkeletonRows rows={4} thumb={0} />
    </Page>
  );
}

/** A conversation: a few bubbles from each side. */
export function SkeletonChat() {
  const insets = useSafeAreaInsets();
  const bubbles: { mine: boolean; w: DimensionValue; h: number }[] = [
    { mine: false, w: "72%", h: 64 },
    { mine: true, w: "55%", h: 40 },
    { mine: false, w: "80%", h: 88 },
    { mine: true, w: "45%", h: 40 },
  ];
  return (
    <Page>
      <View style={{ paddingTop: insets.top + space.xxxl, paddingHorizontal: GUTTER, gap: space.md }}>
        {bubbles.map((b, i) => (
          <Bone key={i} w={b.w} h={b.h} r={18} style={{ alignSelf: b.mine ? "flex-end" : "flex-start" }} />
        ))}
      </View>
    </Page>
  );
}

/** Menu lines: a name and a price, under a category. */
export function SkeletonMenu({ rows = 6 }: { rows?: number }) {
  return (
    <Skeleton style={{ paddingHorizontal: GUTTER, paddingTop: space.md, gap: space.md }}>
      <Bone w="30%" h={12} />
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.lg }}>
          <Bone w={`${60 - ((i * 11) % 25)}%`} h={15} />
          <Bone w={56} h={15} />
        </View>
      ))}
    </Skeleton>
  );
}

/** The paywall's price and button, while the store answers. */
export function SkeletonOffer() {
  return (
    <Skeleton style={{ alignItems: "center", gap: space.sm, marginTop: space.xl }}>
      <Bone w={140} h={34} r={8} />
      <Bone w={180} h={13} />
      <Bone h={54} r={radius.pill} style={{ marginTop: space.lg }} />
    </Skeleton>
  );
}

/** The questionnaire, while the draft comes back: a heading and a list of choices. */
export function SkeletonSteps() {
  const insets = useSafeAreaInsets();
  return (
    <Page>
      <View style={{ paddingTop: insets.top + space.xxxl, paddingHorizontal: GUTTER, gap: space.md }}>
        <Bone w="70%" h={28} r={8} />
        <Bone w="50%" h={14} />
      </View>
      <View style={{ marginTop: space.xl }}>
        <SkeletonRows rows={5} thumb={0} />
      </View>
    </Page>
  );
}
