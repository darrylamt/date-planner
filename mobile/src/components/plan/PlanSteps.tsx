import { View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Text } from "../Text";
import { Group, Row } from "../List";
import { Chip } from "../Chip";
import { ChipRow, Segmented } from "../Segmented";
import { Field, StepHeading } from "../Field";
import { BudgetSlider } from "../BudgetSlider";
import { GUTTER, space } from "../../theme";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { aboutName, possessiveName, pronounSet } from "../../lib/pronouns";
import {
  DURATIONS,
  OCCASIONS,
  PRONOUNS,
  START_TIMES,
  VIBES,
  cap,
  vibeBlurb,
} from "../../lib/planConstants";
import { time12 } from "../../lib/format";
import type { Area, PlanInputs } from "../../lib/types";

export interface StepProps {
  step: number;
  inputs: PlanInputs;
  areas: Area[];
  update: (patch: Partial<PlanInputs>) => void;
}

/** A short explanatory note, styled like a grouped-list footer. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="footnote"
      tone="secondary"
      style={{ paddingHorizontal: GUTTER, marginTop: space.md }}
    >
      {children}
    </Text>
  );
}

/** Uppercase label above a chip row — mirrors a grouped-list section header. */
function GroupLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <Text
      variant="footnote"
      tone="secondary"
      style={{
        paddingHorizontal: GUTTER,
        marginTop: first ? 0 : space.xxl,
        marginBottom: space.sm,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

export function PlanSteps({ step, inputs, areas, update }: StepProps) {
  const c = useTheme();
  const isDark = useIsDark();
  const ps = pronounSet(inputs.partner.pronoun);
  const who = aboutName(inputs.partner.name, inputs.partner.pronoun);
  const poss = possessiveName(inputs.partner.name, inputs.partner.pronoun);
  /* "they love" but "she loves" */
  const verbS = inputs.partner.pronoun === "they" ? "" : "s";
  const contraction = inputs.partner.pronoun === "they" ? "re" : "s";

  if (step === 0) {
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
                  // Keep the two most recent picks, exactly like the web flow.
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

  if (step === 1) {
    return (
      <>
        <StepHeading title="What is the budget?" subtitle="For both of you, all in." />
        <BudgetSlider value={inputs.budget} onChange={(budget) => update({ budget })} />
        <Note>We keep the whole plan inside this — transport included.</Note>
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        <StepHeading
          title="When is the date?"
          subtitle="We check what is open and what is on that day."
        />

        <View
          style={{
            backgroundColor: c.surface,
            borderRadius: 10,
            marginHorizontal: GUTTER,
            marginBottom: space.xxl,
            paddingVertical: space.sm,
            alignItems: "center",
          }}
        >
          <DateTimePicker
            value={new Date(`${inputs.date}T12:00:00`)}
            mode="date"
            display="inline"
            minimumDate={new Date()}
            accentColor={c.tint}
            themeVariant={isDark ? "dark" : "light"}
            onChange={(_event, picked) => {
              if (picked) update({ date: toIsoDate(picked) });
            }}
          />
        </View>

        <GroupLabel first>Start time</GroupLabel>
        <ChipRow>
          {START_TIMES.map((t) => (
            <Chip
              key={t}
              label={time12(t)}
              selected={inputs.startTime === t}
              onPress={() => update({ startTime: t })}
            />
          ))}
        </ChipRow>

        <GroupLabel>How long?</GroupLabel>
        <ChipRow>
          {DURATIONS.map((d) => (
            <Chip
              key={d.label}
              label={d.label}
              selected={inputs.hours === d.hours}
              onPress={() => update({ hours: d.hours })}
            />
          ))}
        </ChipRow>
      </>
    );
  }

  if (step === 3) {
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

  if (step === 4) {
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

  if (step === 5) {
    return (
      <>
        <StepHeading
          title="Who are you planning for?"
          subtitle="A name is optional. It just makes the plan feel like theirs."
        />
        <View style={{ paddingHorizontal: GUTTER }}>
          <Field
            label="Their name (optional)"
            placeholder="e.g. Ama, Kofi"
            value={inputs.partner.name}
            maxLength={60}
            onChangeText={(name) => update({ partner: { ...inputs.partner, name } })}
          />
          <Segmented
            label="How should we refer to them?"
            options={PRONOUNS}
            value={inputs.partner.pronoun}
            onChange={(pronoun) => update({ partner: { ...inputs.partner, pronoun } })}
          />
        </View>
        <Note>Planning for a friend group? Pick They and skip the name.</Note>
      </>
    );
  }

  return (
    <>
      <StepHeading
        title={`Now — tell us about ${who}.`}
        subtitle="The details you add here are what turn a plan into a thoughtful date."
      />
      <View style={{ paddingHorizontal: GUTTER }}>
        <Field
          label={`A food or cuisine ${ps.they} love${verbS}`}
          placeholder="jollof, sushi, waakye"
          value={inputs.partner.food}
          onChangeText={(food) => update({ partner: { ...inputs.partner, food } })}
        />
        <Field
          label={`${cap(ps.their)} kind of place`}
          placeholder="rooftops? gardens? cosy corners?"
          value={inputs.partner.place}
          onChangeText={(place) => update({ partner: { ...inputs.partner, place } })}
        />
        <Field
          label={`Something ${ps.they}${"’"}${contraction} into`}
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
      <Note>This stays between us. It only shapes {poss} evening.</Note>
    </>
  );
}

/** Local date to "YYYY-MM-DD" without the UTC shift toISOString would apply. */
function toIsoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
