import { View } from "react-native";
import { Mascot, SpeechBubble } from "../Mascot";
import { GUTTER, Spacing } from "../../theme";
import type { StepId } from "../../lib/planConstants";
import type { Occasion } from "../../lib/types";

/**
 * A tip from the mascot, sitting beside the question it is about.
 *
 * Deliberately advice a person could not get from the field itself, "pick two
 * areas" is already on the label. These say what the answer will *do* to the
 * plan, which is the thing that is not obvious while filling a form in.
 */
const TIPS: Partial<Record<StepId, string>> = {
  area: "Close together beats far apart.",
  budget: "Food and taxis, all in.",
  when: "Weeknights are quieter.",
  shape: "Just drinks means just drinks.",
  vibe: "I blend them.",
  party: "Changes the table, not just the bill.",
  details: "The odder, the better.",
};

/** Occasion-specific tips take precedence, a pathway should feel like one. */
const OCCASION_TIPS: Partial<Record<Occasion, Partial<Record<StepId, string>>>> = {
  first_date: {
    budget: "Easy beats expensive.",
    vibe: "Somewhere you can hear each other.",
  },
  anniversary: {
    budget: "Worth stretching a little. This one gets remembered.",
  },
  birthday: {
    party: "I will find a table that fits.",
  },
  graduation: {
    party: "I will find room for everyone.",
  },
  solo_day: {
    party: "Places that are good alone.",
    details: "What you actually enjoy, not what sounds good.",
  },
  friend_outing: {
    vibe: "Groups do better with noise than with candlelight.",
  },
};

export function StepMascot({ step, occasion }: { step: StepId; occasion: Occasion }) {
  const tip = OCCASION_TIPS[occasion]?.[step] ?? TIPS[step];
  if (!tip) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: Spacing.two,
        paddingHorizontal: GUTTER,
        marginTop: Spacing.five,
      }}
    >
      <Mascot occasion={occasion} size={64} />
      <View style={{ flex: 1, paddingBottom: Spacing.two }}>
        <SpeechBubble text={tip} align="left" />
      </View>
    </View>
  );
}
