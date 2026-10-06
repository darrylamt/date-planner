import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, Share, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Wheel, type WheelHandle } from "../src/components/fun/Wheel";
import { PeopleEditor } from "../src/components/fun/PeopleEditor";
import { useBurst } from "../src/components/Burst";
import { useReducedMotion } from "../src/components/motion";
import { GUTTER, radius, space, Spacing } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { isMe, rememberNames, rememberedNames, startingNames } from "../src/lib/people";
import { afterSharing } from "../src/lib/review";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/**
 * Who pays: everybody's name on a wheel, one spin, no arguing.
 *
 * A joke tool, and a friendly one: no money moves and nothing is kept but
 * the names, on this phone, for next time. The result is made to be sent
 * to the group chat, which is the point of it.
 */
export default function WhoPays() {
  const c = useTheme();
  const reduced = useReducedMotion();
  const burst = useBurst();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ count?: string }>();
  const wheel = useRef<WheelHandle>(null);

  const [names, setNames] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void rememberedNames().then((saved) => setNames(startingNames(saved, Number(params.count) || 2)));
  }, [params.count]);

  async function spin() {
    if (spinning || names.length < 2) return;
    setWinner(null);
    setSpinning(true);
    void rememberNames(names);
    const at = await wheel.current?.spin();
    setSpinning(false);
    if (at == null || at < 0) return;
    setWinner(names[at]);
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: reduced ? 1 : 420, easing: Easing.out(Easing.back(1.6)), useNativeDriver: false }).start();
    burst(width / 2, 260, ["🎉", "💸", "🥳", "🍾"], 14, 26);
  }

  async function share() {
    if (!winner) return;
    const result = await Share.share({
      message: `The wheel has spoken: ${isMe(winner) ? "I'm paying" : `${winner} pays`} tonight 💸\n\nSpun on Duro!${WEB_URL ? ` ${WEB_URL}/get` : ""}`,
    });
    if (result.action === Share.sharedAction) void afterSharing();
  }

  const size = Math.min(width - GUTTER * 2, 340);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: space.xxxl }}>
      <View style={{ paddingHorizontal: GUTTER, paddingTop: space.md }}>
        <Text variant="display">Who pays?</Text>
        <Text variant="body" tone="secondary" style={{ marginTop: Spacing.two }}>
          Everybody goes on the wheel. One spin, and the wheel decides. No appeals.
        </Text>
      </View>

      <View style={{ alignItems: "center", marginTop: space.xl }}>
        <Wheel ref={wheel} labels={names.length >= 2 ? names : ["…", "…"]} size={size} onCentrePress={() => void spin()} />
      </View>

      {winner ? (
        <Animated.View
          style={{
            marginHorizontal: GUTTER,
            marginTop: space.xl,
            padding: space.xl,
            borderRadius: radius.card,
            backgroundColor: c.accentSoft,
            alignItems: "center",
            gap: space.sm,
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }}
        >
          <Text variant="footnote" weight="700" tone="tint" style={{ letterSpacing: 0.8 }}>
            THE WHEEL HAS SPOKEN
          </Text>
          <Text variant="largeTitle" center>
            {isMe(winner) ? "You pay" : `${winner} pays`} 💸
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
            <Button title="Tell the group" icon="square.and.arrow.up" size="medium" onPress={() => void share()} />
            <Button title="Split it instead" kind="gray" size="medium" onPress={() => router.push("/split")} />
          </View>
        </Animated.View>
      ) : null}

      <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl }}>
        <Button
          title={spinning ? "Spinning…" : winner ? "Spin again" : "Spin the wheel"}
          icon="arrow.clockwise"
          disabled={spinning || names.length < 2}
          onPress={() => void spin()}
        />
      </View>

      <View style={{ paddingHorizontal: GUTTER, marginTop: space.xxl, gap: space.sm }}>
        <Text variant="footnote" weight="600" tone="secondary">
          WHO'S ON THE WHEEL
        </Text>
        <PeopleEditor
          names={names}
          onChange={(next) => {
            setNames(next);
            setWinner(null);
          }}
        />
        <Text variant="caption1" tone="tertiary">
          Names stay on this phone, for next time.
        </Text>
      </View>
    </ScrollView>
  );
}
