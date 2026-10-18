import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "../Text";
import { Chip } from "../Chip";
import { Field } from "../Field";
import { Button } from "../Button";
import { BudgetSlider } from "../BudgetSlider";
import { space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { fetchAreas } from "../../lib/data";
import { VIBES } from "../../lib/planConstants";
import { HARD_NOS, SLOTS, SLOT_LABEL, datesInRange, type Availability, type GroupAnswer, type GroupPublic, type HardNo, type Slot } from "../../lib/groups";
import type { Area } from "../../lib/types";

/**
 * Answering a group outing in the app: the same questions as the web page.
 *
 * Name first, because it is what fills Who pays and Split the bill later.
 * The budget is said, plainly, to be private: nobody else sees it, the
 * organiser included, and the plan only uses it to size this person's order.
 */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function GroupAnswerForm({
  group,
  initial,
  defaultName,
  busy,
  error,
  onSubmit,
}: {
  group: GroupPublic;
  initial: GroupAnswer | null;
  defaultName: string;
  busy: boolean;
  error: string | null;
  onSubmit: (answer: GroupAnswer) => void;
}) {
  const c = useTheme();
  const dates = useMemo(() => datesInRange(group.dateFrom, group.dateTo), [group.dateFrom, group.dateTo]);
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [availability, setAvailability] = useState<Availability>(initial?.availability ?? {});
  const [budget, setBudget] = useState(initial?.budget ?? 300);
  const [vibes, setVibes] = useState<string[]>(initial?.vibes ?? []);
  const [nos, setNos] = useState<HardNo[]>(initial?.hardNos ?? []);
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [fromAreaId, setFromAreaId] = useState<string | null>(initial?.fromAreaId ?? null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaQuery, setAreaQuery] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAreas().then(setAreas).catch(() => setAreas([]));
  }, []);

  const chosenArea = areas.find((a) => a.id === fromAreaId) ?? null;
  const matches = areaQuery.trim()
    ? areas.filter((a) => a.name.toLowerCase().includes(areaQuery.trim().toLowerCase())).slice(0, 8)
    : [];

  const toggleSlot = (date: string, slot: Slot) =>
    setAvailability((cur) => {
      const now = new Set(cur[date] ?? []);
      if (now.has(slot)) now.delete(slot);
      else now.add(slot);
      return { ...cur, [date]: [...now] as Slot[] };
    });

  function submit() {
    if (name.trim().length < 2) return setLocalError("What should the group call you?");
    if (!Object.values(availability).some((s) => s.length)) return setLocalError("Tick at least one time you can make it.");
    setLocalError(null);
    onSubmit({
      name: name.trim(),
      availability,
      budget,
      vibes,
      hardNos: nos,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 5),
      fromAreaId,
    });
  }

  return (
    <View style={{ gap: space.xl }}>
      <Field label="What should the group call you?" value={name} onChangeText={setName} maxLength={24} placeholder="Name or nickname" />

      <View style={{ gap: space.sm }}>
        <Text variant="headline">When can you make it?</Text>
        {dates.map((date) => (
          <View key={date} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
            <Text variant="body" weight="600" style={{ width: 104 }}>
              {dayLabel(date)}
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {SLOTS.map((slot) => (
                <Chip key={slot} label={SLOT_LABEL[slot]} selected={(availability[date] ?? []).includes(slot)} onPress={() => toggleSlot(date, slot)} />
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">How much do you want to spend?</Text>
        <BudgetSlider value={budget} onChange={setBudget} />
        <Text variant="footnote" tone="secondary">
          Only you see this, not even {group.organiser}. Duro just makes sure the plan works for it, and sizes your own order to it.
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">What are you into? Up to three</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {VIBES.filter((v) => v !== "Romantic").map((v) => (
            <Chip
              key={v}
              label={v}
              selected={vibes.includes(v)}
              onPress={() => setVibes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length >= 3 ? cur : [...cur, v]))}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">Anything you won&apos;t do?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {HARD_NOS.map((h) => (
            <Chip
              key={h.id}
              label={h.label}
              selected={nos.includes(h.id)}
              onPress={() => setNos((cur) => (cur.includes(h.id) ? cur.filter((x) => x !== h.id) : [...cur, h.id]))}
            />
          ))}
        </View>
        <Field value={tags} onChangeText={setTags} maxLength={120} placeholder="Anything else? e.g. no spicy food" />
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">Where are you coming from?</Text>
        {chosenArea ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Chip label={chosenArea.name} selected onPress={() => setFromAreaId(null)} />
          </View>
        ) : (
          <>
            <Field value={areaQuery} onChangeText={setAreaQuery} placeholder="Type your area, e.g. Osu" autoCorrect={false} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {matches.map((a) => (
                <Chip
                  key={a.id}
                  label={a.name}
                  selected={false}
                  onPress={() => {
                    setFromAreaId(a.id);
                    setAreaQuery("");
                  }}
                />
              ))}
            </View>
          </>
        )}
      </View>

      {localError || error ? (
        <Text variant="subheadline" weight="600" style={{ color: c.danger }}>
          {localError ?? error}
        </Text>
      ) : null}
      <Button title={busy ? "Sending…" : initial ? "Update my answer" : "Count me in"} onPress={submit} disabled={busy} />
    </View>
  );
}
