import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "../Text";
import { Group, Row } from "../List";
import { Chip } from "../Chip";
import { ChipRow, Segmented } from "../Segmented";
import { Field, StepHeading } from "../Field";
import { BudgetSlider } from "../BudgetSlider";
import { WheelPicker } from "../WheelPicker";
import { DayStrip } from "./DayStrip";
import { GUTTER, Spacing } from "../../theme";
import { aboutName, possessiveName, pronounForGender, pronounSet } from "../../lib/pronouns";
import {
  DURATIONS,
  CUISINE_OPTIONS,
  FOCUS_OPTIONS,
  FORMALITY_OPTIONS,
  OCCASION_EXTRA,
  OCCASIONS,
  PARTY_RULES,
  partySizeOptions,
  VIBES,
  cap,
  partyLabel,
  startTimeOptions,
  vibeBlurb,
} from "../../lib/planConstants";
import { time12 } from "../../lib/format";
import type { StepId } from "../../lib/planConstants";
import type { SymbolViewProps } from "expo-symbols";
import type { Area, Gender, PlanFocus, PlanInputs } from "../../lib/types";

/** SF Symbols stay in the mobile layer; the shared constants are platform-free. */
const FOCUS_ICON: Record<PlanFocus, SymbolViewProps["name"]> = {
  everything: "sparkles",
  food: "fork.knife",
  drinks: "wineglass",
  activities: "figure.walk",
};

/** Icons live in the mobile layer; the shared constants stay platform-free. */
const FORMALITY_ICON: Record<string, SymbolViewProps["name"]> = {
  either: "wand.and.stars",
  casual: "tshirt",
  fancy: "sparkles",
};

/**
 * The pronoun question, asked by example.
 *
 * Each option shows the line the plan would actually write, so the choice is
 * about the copy rather than about the person.
 */
const PRONOUN_CHOICES: {
  value: Gender;
  sub: string;
  example: (name: string) => string;
}[] = [
  {
    value: "unspecified",
    sub: "Neutral, and the default",
    example: (n) => `${n.trim() || "They"} will love this`,
  },
  {
    value: "female",
    sub: "She, her",
    example: (n) => `${n.trim() || "She"} will love this`,
  },
  {
    value: "male",
    sub: "He, him",
    example: (n) => `${n.trim() || "He"} will love this`,
  },
];

export interface StepProps {
  /** Named, not numbered: the order changes per occasion pathway. */
  step: StepId;
  inputs: PlanInputs;
  areas: Area[];
  update: (patch: Partial<PlanInputs>) => void;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="footnote"
      tone="secondary"
      style={{ paddingHorizontal: GUTTER, marginTop: Spacing.three }}
    >
      {children}
    </Text>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="eyebrow"
      tone="secondary"
      uppercase
      style={{
        paddingHorizontal: GUTTER,
        marginTop: Spacing.five,
        marginBottom: Spacing.two,
      }}
    >
      {children}
    </Text>
  );
}

export function PlanSteps({ step, inputs, areas, update }: StepProps) {
  const solo = inputs.partySize <= 1;
  const pair = inputs.partySize === 2;
  const pronoun = pronounForGender(inputs.partner.gender);
  const ps = pronounSet(pronoun);
  const who = solo ? "you" : aboutName(inputs.partner.name, pronoun);
  const poss = solo ? "your" : possessiveName(inputs.partner.name, pronoun);
  /* "they love" but "she loves", and a group is always plural. */
  const verbS = pronoun === "they" || !pair ? "" : "s";
  const contraction = pronoun === "they" || !pair ? "re" : "s";

  if (step === "area") {
    return (
      <>
        <StepHeading title="Where in Accra?" subtitle="Up to two." />
        <Group>
          {areas.map((a) => {
            const on = inputs.areaIds.includes(a.id);
            return (
              <Row
                key={a.id}
                title={a.name}
                selected={on}
                onPress={() => {
                  const ids = on
                    ? inputs.areaIds.filter((x) => x !== a.id)
                    // Four, not two. A bar crawl or a whole evening can
                    // reasonably cross the city, and capping at two quietly
                    // made those plans smaller than the budget allowed. Still
                    // capped, because an unbounded pick turns the taxi budget
                    // into the whole plan.
                    : [...inputs.areaIds, a.id].slice(-4);
                  update({
                    areaIds: ids,
                    areaNames: areas.filter((x) => ids.includes(x.id)).map((x) => x.name),
                    surpriseMe: false,
                  });
                }}
              />
            );
          })}
        </Group>

        <Group>
          <Row
            icon="dice.fill"
            title="Surprise me"
            selected={inputs.surpriseMe}
            onPress={() =>
              update({ surpriseMe: !inputs.surpriseMe, areaIds: [], areaNames: [] })
            }
          />
        </Group>
      </>
    );
  }

  if (step === "budget") {
    return (
      <>
        <StepHeading
          title="What is the budget?"
          subtitle={`For ${partyLabel(inputs.partySize)}, all in.`}
        />
        <BudgetSlider value={inputs.budget} onChange={(budget) => update({ budget })} />
        <Note>{inputs.budget === 0 ? "Free places only." : "Includes transport."}</Note>
      </>
    );
  }

  if (step === "when") {
    return (
      <>
        <StepHeading title="When is it?" />

        <DayStrip value={inputs.date} onChange={(date) => update({ date })} />

        <GroupLabel>Start time</GroupLabel>
        <WheelPicker
          options={startTimeOptions().map((t) => ({ value: t, label: time12(t) }))}
          value={inputs.startTime}
          onChange={(startTime) => update({ startTime })}
        />

        <GroupLabel>How long?</GroupLabel>
        <WheelPicker
          options={DURATIONS.map((d) => ({ value: d.hours, label: d.label }))}
          value={inputs.hours}
          onChange={(hours) => update({ hours })}
        />
      </>
    );
  }

  if (step === "shape") {
    return (
      <>
        <StepHeading
          title="What are you after?"
          subtitle="Pick one."
        />
        <Group>
          {FOCUS_OPTIONS.map((f) => (
            <Row
              key={f.id}
              icon={FOCUS_ICON[f.id]}
              title={f.title}
              subtitle={f.sub}
              selected={inputs.focus === f.id}
              onPress={() => update({ focus: f.id })}
            />
          ))}
        </Group>

        {/*
          Only when the evening involves eating. Asking someone who picked
          "just drinks" whether they want local or continental food is a
          question with no consequence, and a flow that asks those teaches
          people to stop reading it.
        */}
        {inputs.focus === "everything" || inputs.focus === "food" ? (
          <>
            <GroupLabel>Local or continental?</GroupLabel>
            <Group>
              {CUISINE_OPTIONS.map((f) => (
                <Row
                  key={f.id}
                  title={f.title}
                  subtitle={f.sub}
                  selected={inputs.cuisine === f.id}
                  onPress={() => update({ cuisine: f.id })}
                />
              ))}
            </Group>
          </>
        ) : null}

        <GroupLabel>How dressed up?</GroupLabel>
        {/*
          Cards rather than a segmented control. Every other choice in this
          flow is a row with a subtitle explaining what it does, and one bare
          three-way toggle in the middle of them read like a settings screen
          that had wandered in.
        */}
        <Group>
          {FORMALITY_OPTIONS.map((f) => (
            <Row
              key={f.id}
              icon={FORMALITY_ICON[f.id]}
              title={f.title}
              subtitle={f.sub}
              selected={inputs.formality === f.id}
              onPress={() => update({ formality: f.id })}
            />
          ))}
        </Group>

      </>
    );
  }

  if (step === "vibe") {
    return (
      <>
        <StepHeading title="What is the vibe?" subtitle="Up to three." />
        <ChipRow>
          {VIBES.map((v) => {
            const val = v.toLowerCase();
            const on = inputs.vibes.includes(val);
            return (
              <Chip
                key={v}
                label={v}
                selected={on}
                onPress={() =>
                  update({
                    vibes: on
                      ? inputs.vibes.filter((x) => x !== val)
                      : [...inputs.vibes, val].slice(-3),
                  })
                }
              />
            );
          })}
        </ChipRow>
        {inputs.vibes.length > 0 ? <Note>{vibeBlurb(inputs.vibes)}</Note> : null}
      </>
    );
  }

  if (step === "occasion") {
    return (
      <>
        <StepHeading title="What is the occasion?" />
        <Group>
          {OCCASIONS.map((o) => (
            <Row
              key={o.id}
              title={o.title}
              subtitle={o.sub}
              selected={inputs.occasion === o.id}
              onPress={() => update({ occasion: o.id })}
            />
          ))}
        </Group>
      </>
    );
  }

  if (step === "party") {
    const rule = PARTY_RULES[inputs.occasion];
    return (
      <>
        <StepHeading
          title={rule.fixed ? "Who is coming?" : "How many of you?"}
          subtitle={rule.fixed ? undefined : (rule.note ?? undefined)}
        />

        {rule.fixed ? (
          /* Not a choice. Offering a wheel here would invite an answer that
             makes the rest of the plan incoherent. */
          <View style={{ alignItems: "center", paddingHorizontal: GUTTER }}>
            <Text variant="display">{rule.fixed}</Text>
            <Text variant="body" tone="secondary" center style={{ marginTop: Spacing.two }}>
              {rule.note}
            </Text>
          </View>
        ) : (
          <WheelPicker
            options={partySizeOptions(inputs.occasion).map((n) => ({
              value: n,
              label: n === 1 ? "Just me" : String(n),
            }))}
            value={inputs.partySize}
            onChange={(partySize) =>
              update({
                partySize,
                // Drop names that no longer have a seat.
                companions: inputs.companions.slice(0, Math.max(0, partySize - 1)),
              })
            }
            suffix={inputs.partySize > 1 ? "people" : undefined}
          />
        )}

        {pair ? (
          <>
          <View style={{ paddingHorizontal: GUTTER, marginTop: Spacing.five }}>
            <Field
              label="Their name (optional)"
              placeholder="e.g. Ama, Kofi"
              value={inputs.partner.name}
              maxLength={60}
              onChangeText={(name) => update({ partner: { ...inputs.partner, name } })}
            />
          </View>

          {/*
            Asked as "which of these reads right" rather than "is it a him or
            a her". The app only wants this to write a sentence, so showing
            the sentence is both a clearer question and a less presumptuous
            one: you are picking how the plan should read, not filing someone
            under a category.
          */}
          <GroupLabel>Which reads right?</GroupLabel>
          <Group footer="Only used to write your plan. Skip it and we stay neutral.">
            {PRONOUN_CHOICES.map((choice) => (
              <Row
                key={choice.value}
                title={choice.example(inputs.partner.name)}
                subtitle={choice.sub}
                selected={inputs.partner.gender === choice.value}
                onPress={() =>
                  update({ partner: { ...inputs.partner, gender: choice.value } })
                }
              />
            ))}
          </Group>
          </>
        ) : null}

        {inputs.partySize > 2 ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: Spacing.five }}>
            <CompanionsField
              names={inputs.companions}
              max={inputs.partySize - 1}
              onChange={(companions) => update({ companions })}
            />
            <Text variant="footnote" tone="secondary">
              Only used so the plan reads like it was written for your group.
            </Text>
          </View>
        ) : null}

        {solo ? (
          <Note>
            A day to yourself. We keep to places that are good on your own, counter
            seats, somewhere comfortable to just be.
          </Note>
        ) : null}
      </>
    );
  }

  if (step === "extra") {
    const extra = OCCASION_EXTRA[inputs.occasion];
    if (!extra) return null;
    return (
      <>
        <StepHeading title={extra.title} subtitle={extra.subtitle} />
        <View style={{ paddingHorizontal: GUTTER }}>
          {extra.fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              placeholder={f.placeholder}
              multiline={f.multiline}
              value={inputs.occasionDetail[f.key] ?? ""}
              onChangeText={(v) =>
                update({ occasionDetail: { ...inputs.occasionDetail, [f.key]: v } })
              }
            />
          ))}
        </View>
      </>
    );
  }

  return (
    <>
      <StepHeading
        title={solo ? "Now, tell us about you." : `Now, tell us about ${who}.`}
        subtitle="All optional."
      />
      <View style={{ paddingHorizontal: GUTTER }}>
        <Field
          label={solo ? "A food or cuisine you love" : `A food or cuisine ${ps.they} love${verbS}`}
          placeholder="jollof, sushi, waakye"
          value={inputs.partner.food}
          onChangeText={(food) => update({ partner: { ...inputs.partner, food } })}
        />
        <Field
          label={solo ? "Your kind of place" : `${cap(ps.their)} kind of place`}
          placeholder="rooftops? gardens? cosy corners?"
          value={inputs.partner.place}
          onChangeText={(place) => update({ partner: { ...inputs.partner, place } })}
        />
        <Field
          label={
            solo ? "Something you are into" : `Something ${ps.they}${"’"}${contraction} into`
          }
          placeholder="a movie, artist, or hobby"
          value={inputs.partner.interests}
          onChangeText={(interests) => update({ partner: { ...inputs.partner, interests } })}
        />
        <Field
          label="Anything to avoid?"
          placeholder="allergies, loud music, long walks"
          value={inputs.partner.avoid}
          onChangeText={(avoid) => update({ partner: { ...inputs.partner, avoid } })}
          multiline
        />
      </View>

    </>
  );
}

/**
 * Who else is coming.
 *
 * The comma has to live in local state. This was a controlled field whose
 * value was the parsed names joined back together, so the moment you typed a
 * comma it was split on, trimmed, and dropped by filter(Boolean) before the
 * value was rebuilt without it. The character could never survive its own
 * round trip, and the field looked broken because it was.
 *
 * The text is what you typed; the parsed names go up on every keystroke, so
 * nothing is lost if the step is left without blurring.
 */
function CompanionsField({
  names,
  max,
  onChange,
}: {
  names: string[];
  max: number;
  onChange: (names: string[]) => void;
}) {
  const [text, setText] = useState(names.join(", "));

  /*
   * Re-sync only when the parsed result no longer matches what is typed, which
   * happens when the party size shrinks and trims the list from underneath.
   * Without the guard this would fight the cursor on every keystroke.
   */
  useEffect(() => {
    const typed = parseNames(text, max);
    if (typed.join("|") !== names.join("|")) setText(names.join(", "));
    // Deliberately keyed on the parsed names only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join("|"), max]);

  return (
    <Field
      label="Who else is coming? (optional)"
      placeholder="Ama, Kofi, Yaw"
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(parseNames(next, max));
      }}
    />
  );
}

function parseNames(text: string, max: number): string[] {
  return text
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, Math.max(0, max));
}
