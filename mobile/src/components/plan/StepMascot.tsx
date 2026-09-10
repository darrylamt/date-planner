import { View } from "react-native";
import { Mascot, SpeechBubble } from "../Mascot";
import { GUTTER, Spacing } from "../../theme";
import type { StepId } from "../../lib/planConstants";
import type { Occasion } from "../../lib/types";

/**
 * A tip from the mascot, sitting beside the question it is about.
 *
 * Deliberately advice a person could not get from the field itself — "pick two
 * areas" is already on the label. These say what the answer will *do* to the
 * plan, which is the thing that is not obvious while filling a form in.
 */
const TIPS: Partial<Record<StepId, string>> = {
  area: "Two areas keeps the taxi hops short. One keeps them shorter.",
  budget: "This covers everything — food and getting between places.",
  when: "Weeknights are quieter. Weekends have more on.",
  vibe: "Two or three works better than one. I blend them.",
  party: "Numbers change the table, not just the bill.",
  details: "The odder the detail, the better I can do.",
};

/** Occasion-specific tips take precedence — a pathway should feel like one. */
const OCCASION_TIPS: Partial<Record<Occasion, Partial<Record<StepId, string>>>> = {
  first_date: {
    budget: "First dates do not need to be expensive. They need to be easy.",
    vibe: "Somewhere you can hear each other beats somewhere impressive.",
  },
  anniversary: {
    budget: "Worth stretching a little. This one gets remembered.",
  },
  birthday: {
    party: "Tell me everyone coming and I will find a table that fits.",
  },
  graduation: {
    party: "Graduations run big. I will look for places that seat a crowd.",
  },
  solo_day: {
    party: "Just you. I will keep to places that are good on your own.",
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
