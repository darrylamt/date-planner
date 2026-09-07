import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, View } from "react-native";
import { Text } from "../Text";
import { Button } from "../Button";
import { Group, Row } from "../List";
import { Symbol } from "../Symbol";
import { GUTTER, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { possessiveName } from "../../lib/pronouns";
import type { GenerateResponse, PlanInputs } from "../../lib/types";

/** Shared centred layout for the full-screen states. */
function Centred({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: GUTTER + space.sm,
      }}
    >
      {children}
    </View>
  );
}

/**
 * Generating state. Generation takes 10-40s, so the screen has to carry that
 * wait: a live spinner plus rotating status lines that name what we are
 * actually doing with their answers.
 */
export function LoadingPlan({ inputs }: { inputs: PlanInputs }) {
  const c = useTheme();
  const areaLabel = inputs.surpriseMe ? "Accra" : (inputs.areaNames[0] ?? "Accra");
  const messages = [
    `Checking menus in ${areaLabel}`,
    `Balancing your GHS ${inputs.budget.toLocaleString()}`,
    "Adding a personal touch",
  ];

  const [active, setActive] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      // Swap the text at the midpoint of the crossfade.
      setTimeout(() => setActive((a) => (a + 1) % messages.length), 220);
    }, 2400);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poss = possessiveName(inputs.partner.name, inputs.partner.pronoun);
  const hint = inputs.partner.place
    ? `Because ${inputs.partner.name || "they"} love${inputs.partner.name ? "s" : ""} ${inputs.partner.place.toLowerCase()}, we are shaping the evening around it.`
    : "We are weaving the little details you shared into every stop.";

  return (
    <Centred>
      <ActivityIndicator size="large" color={c.accent} />

      <Text variant="title2" center style={{ marginTop: space.xxl }}>
        Putting {poss} evening together
      </Text>

      <Animated.View style={{ opacity: fade, marginTop: space.lg, minHeight: 24 }}>
        <Text variant="body" tone="secondary" center>
          {messages[active]}
        </Text>
      </Animated.View>

      <View
        style={{
          marginTop: space.xxxl,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          backgroundColor: c.backgroundSunken,
          borderRadius: 12,
        }}
      >
        <Text variant="footnote" tone="secondary" center>
          {hint}
        </Text>
      </View>
    </Centred>
  );
}

/** Not enough real venues matched — offer the two fixes that actually work. */
export function NoMatch({
  data,
  onSuggestion,
  onStartOver,
}: {
  data: Extract<GenerateResponse, { status: "no_match" }>;
  onSuggestion: (s: { action: "widen_area" | "raise_budget"; value?: number }) => void;
  onStartOver: () => void;
}) {
  const c = useTheme();

  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <View style={{ alignItems: "center", paddingHorizontal: GUTTER + space.sm }}>
        <Symbol name="magnifyingglass" size={44} color={c.textSecondary} />
        <Text variant="title2" center style={{ marginTop: space.lg }}>
          {data.headline}
        </Text>
        <Text variant="body" tone="secondary" center style={{ marginTop: space.sm }}>
          {data.message}
        </Text>
      </View>

      <View style={{ marginTop: space.xl }}>
        <Group>
          {data.suggestions.map((s) => (
            <Row key={s.label} title={s.label} chevron onPress={() => onSuggestion(s)} />
          ))}
        </Group>
      </View>

      <View style={{ paddingHorizontal: GUTTER }}>
        <Button
          title="Start over with different answers"
          kind="plain"
          onPress={onStartOver}
          block
        />
      </View>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const c = useTheme();

  return (
    <Centred>
      <Symbol name="exclamationmark.triangle.fill" size={44} color={c.warning} />
      <Text variant="title2" center style={{ marginTop: space.lg }}>
        That one is on us.
      </Text>
      <Text variant="body" tone="secondary" center style={{ marginTop: space.sm }}>
        {message ??
          "Something went wrong while building the plan. Your answers are safe — nothing was lost."}
      </Text>
      <View style={{ alignSelf: "stretch", marginTop: space.xl }}>
        <Button title="Try again" onPress={onRetry} />
      </View>
    </Centred>
  );
}
