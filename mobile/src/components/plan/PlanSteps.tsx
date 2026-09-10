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
  OCCASION_EXTRA,
  OCCASIONS,
  PARTY_SIZES,
  VIBES,
  cap,
  partyLabel,
  startTimeOptions,
  vibeBlurb,
} from "../../lib/planConstants";
import { time12 } from "../../lib/format";
import type { StepId } from "../../lib/planConstants";
import type { Area, Gender, PlanInputs } from "../../lib/types";

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
  /* "they love" but "she loves" — and a group is always plural. */
  const verbS = pronoun === "they" || !pair ? "" : "s";
  const contraction = pronoun === "they" || !pair ? "re" : "s";

  if (step === "area") {
    return (
      <>
        <StepHeading
          title="Where in Accra?"
          subtitle="Pick one or two areas so we can keep the stops close together."
        />
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
                    : [...inputs.areaIds, a.id].slice(-2);
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

        <Group footer="We pick a corner of the city you have not tried.">
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
        <Note>We keep the whole plan inside this — transport included.</Note>
      </>
    );
  }

  if (step === "when") {
    return (
      <>
        <StepHeading title="When is it?" subtitle="We check what is open and what is on." />

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

  if (step === "vibe") {
    return (
      <>
        <StepHeading title="What is the vibe?" subtitle="Choose up to three and we blend them." />
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
        <StepHeading title="What is the occasion?" subtitle="It changes the pace we plan for." />
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
    return (
      <>
        <StepHeading
          title="Who is coming?"
          subtitle="This sets the portions, the table and how far the budget goes."
        />

        <WheelPicker
          options={PARTY_SIZES.map((n) => ({
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

        {pair ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: Spacing.five }}>
            <Field
              label="Their name (optional)"
              placeholder="e.g. Ama, Kofi"
              value={inputs.partner.name}
              maxLength={60}
              onChangeText={(name) => update({ partner: { ...inputs.partner, name } })}
            />
            <Segmented
              label="Is it a him or a her? (optional)"
              options={
                [
                  { value: "unspecified", label: "Rather not say" },
                  { value: "female", label: "Her" },
                  { value: "male", label: "Him" },
                ] as { value: Gender; label: string }[]
              }
              value={inputs.partner.gender}
              onChange={(gender) => update({ partner: { ...inputs.partner, gender } })}
            />
          </View>
        ) : null}

        {inputs.partySize > 2 ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: Spacing.five }}>
            <Field
              label="Who else is coming? (optional)"
              placeholder="Ama, Kofi, Yaw"
              value={inputs.companions.join(", ")}
              onChangeText={(text) =>
                update({
                  companions: text
                    .split(",")
                    .map((n) => n.trim())
                    .filter(Boolean)
                    .slice(0, inputs.partySize - 1),
                })
              }
            />
            <Text variant="footnote" tone="secondary">
              Only used so the plan reads like it was written for your group.
            </Text>
          </View>
        ) : null}

        {solo ? (
          <Note>
            A day to yourself. We keep to places that are good on your own — counter
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
        title={solo ? "Now — tell us about you." : `Now — tell us about ${who}.`}
        subtitle="The details here are what turn a plan into a thoughtful one."
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
      <Note>This stays between us. It only shapes {poss} day.</Note>
    </>
  );
}
