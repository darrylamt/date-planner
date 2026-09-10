import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "../Text";
import { Button } from "../Button";
import { Group, Row } from "../List";
import { Symbol } from "../Symbol";
import { Mascot, SpeechBubble } from "../Mascot";
import { GUTTER, Spacing, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { possessiveName, pronounForGender } from "../../lib/pronouns";
import { loadingLines } from "../../lib/mascotLines";
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
  const lines = loadingLines(inputs);
  const [active, setActive] = useState(0);

  useEffect(() => {
    // Slower than the mascot's frame cycle so the two do not beat against
    // each other; generation runs 25-40s, which is 6-8 lines.
    const timer = setInterval(() => setActive((a) => (a + 1) % lines.length), 3200);
    return () => clearInterval(timer);
  }, [lines.length]);

  const poss = possessiveName(
    inputs.partner.name,
    pronounForGender(inputs.partner.gender)
  );
  const heading =
    inputs.partySize <= 1
      ? "Putting your day together"
      : inputs.partySize > 2
        ? "Putting your day together"
        : `Putting ${poss} evening together`;

  return (
    <Centred>
      <SpeechBubble text={lines[active]} />
      <Mascot occasion={inputs.occasion} size={140} style={{ marginTop: Spacing.two }} />

      <Text variant="title2" center style={{ marginTop: Spacing.five }}>
        {heading}
      </Text>

      <ActivityIndicator color={c.accent} style={{ marginTop: Spacing.four }} />
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
  onSuggestion: (s: {
    action: "widen_area" | "raise_budget" | "clear_focus";
    value?: number;
  }) => void;
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
          "Something went wrong. Your answers are safe."}
      </Text>
      <View style={{ alignSelf: "stretch", marginTop: space.xl }}>
        <Button title="Try again" onPress={onRetry} />
      </View>
    </Centred>
  );
}
