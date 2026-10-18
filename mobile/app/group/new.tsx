import { useMemo, useState } from "react";
import { Share, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Chip } from "../../src/components/Chip";
import { Field } from "../../src/components/Field";
import { Button } from "../../src/components/Button";
import { RangeCalendar, addDaysISO, localISO, spanDays, type DayRange } from "../../src/components/plan/RangeCalendar";
import { Segmented } from "../../src/components/Segmented";
import { Paywall } from "../../src/components/chat/Paywall";
import { GUTTER, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import { useAuth } from "../../src/lib/useAuth";
import { createGroup, groupLink } from "../../src/lib/groupApi";
import { GROUP_MAX_DAYS, GROUP_MAX_PICKED, GROUP_PICK_WINDOW_DAYS, type GroupOccasion } from "../../src/lib/groups";

/**
 * Start a group outing: what it is, which days, and when answers close.
 *
 * Needs a real account, because the group has to outlive a reinstall and
 * reach the organiser by push. Friends never need one.
 */
const OCCASIONS: { id: GroupOccasion; label: string }[] = [
  { id: "friend_outing", label: "Night out" },
  { id: "birthday", label: "Birthday" },
  { id: "celebration", label: "Celebration" },
  { id: "graduation", label: "Graduation" },
];
const SIZES = [3, 4, 5, 6, 8, 10, 12];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (dateIso: string, n: number) => {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

export default function NewGroup() {
  const c = useTheme();
  const { session, anonymous, loading } = useAuth();
  const [occasion, setOccasion] = useState<GroupOccasion>("friend_outing");
  const [title, setTitle] = useState("");
  // Three days from three days out, until they choose: a weekend-ish default.
  const [range, setRange] = useState<DayRange>(() => {
    const s = addDaysISO(localISO(new Date()), 3);
    return { start: s, end: addDaysISO(s, 2) };
  });
  // A run of days, or particular days ("Friday or Saturday", "any Saturday this month").
  const [mode, setMode] = useState<"range" | "pick">("range");
  const [picked, setPicked] = useState<string[]>([]);
  const [expected, setExpected] = useState<number | null>(null);
  const [name, setName] = useState(() => String(session?.user?.user_metadata?.display_name ?? "").split(/\s+/)[0] ?? "");
  const [deadlineKey, setDeadlineKey] = useState<"tomorrow" | "two_days" | "day_before">("tomorrow");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywalled, setPaywalled] = useState(false);

  // A range still waiting for its last day is that one day.
  const start = range.start ?? addDaysISO(localISO(new Date()), 3);
  const rangeEnd = range.end ?? start;
  const first = mode === "pick" && picked.length ? [...picked].sort()[0] : start;
  const end = mode === "pick" && picked.length ? [...picked].sort()[picked.length - 1] : rangeEnd;
  // From tomorrow, so answers have time to come in, to the edge of what a group may span (0084).
  const minDay = useMemo(() => addDaysISO(localISO(new Date()), 1), []);
  const maxDay = useMemo(() => addDaysISO(localISO(new Date()), GROUP_PICK_WINDOW_DAYS), []);
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  // When answers close: never later than the evening before the first day.
  const deadlines = useMemo(() => {
    const now = Date.now();
    const dayBefore = new Date(`${addDays(first, -1)}T18:00:00Z`).getTime();
    const opts = [
      { key: "tomorrow" as const, label: "Tomorrow evening", at: new Date(`${addDays(iso(new Date()), 1)}T18:00:00Z`).getTime() },
      { key: "two_days" as const, label: "In two days", at: new Date(`${addDays(iso(new Date()), 2)}T18:00:00Z`).getTime() },
      { key: "day_before" as const, label: "The day before", at: dayBefore },
    ];
    return opts.filter((o) => o.at > now + 3_600_000 && o.at <= dayBefore);
  }, [first]);
  const deadline = deadlines.find((d) => d.key === deadlineKey) ?? deadlines[deadlines.length - 1] ?? null;

  if (!loading && (!session || anonymous)) {
    return (
      <Screen contentStyle={{ paddingHorizontal: GUTTER, gap: space.lg, paddingTop: space.lg }}>
        <Text variant="display">Plan with friends</Text>
        <Text variant="body" tone="secondary">
          Sign in to start a group outing. Your friends don&apos;t need an account to answer, just the link.
        </Text>
        <Button title="Sign in" onPress={() => router.push("/login")} />
      </Screen>
    );
  }

  if (paywalled) {
    return (
      <Screen contentStyle={{ paddingHorizontal: GUTTER, paddingTop: space.lg }}>
        <Paywall tier="free" reason="groups" onPurchased={() => setPaywalled(false)} />
      </Screen>
    );
  }

  async function start_() {
    if (name.trim().length < 2) return setError("Add the name your friends know you by.");
    if (mode === "pick" && !picked.length) return setError("Pick at least one day.");
    if (!deadline) return setError("Pick later dates: answers need time to come in.");
    setBusy(true);
    setError(null);
    const r = await createGroup({
      occasion,
      title: title.trim() || undefined,
      ...(mode === "pick" ? { days: [...picked].sort() } : { dateFrom: start, dateTo: end }),
      deadline: new Date(deadline.at).toISOString(),
      expected: expected ?? undefined,
      organiserName: name.trim(),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.error === "groups_limit") return setPaywalled(true);
      return setError(
        r.error === "name" ? "Use letters and numbers for your name." : r.error === "account_needed" ? "Sign in with an account first." : "That didn't go through. Try again."
      );
    }
    const what = title.trim() || OCCASIONS.find((o) => o.id === occasion)!.label.toLowerCase();
    await Share.share({
      message: `I'm planning ${what} on Duro! Say when you're free and what you're into, your budget stays private: ${groupLink(r.data.code)}`,
    }).catch(() => null);
    router.replace(`/group/${r.data.code}`);
  }

  return (
    <Screen
      contentStyle={{ paddingHorizontal: GUTTER, gap: space.xl, paddingTop: space.md }}
      footer={
        <View style={{ paddingHorizontal: GUTTER, paddingVertical: space.md, backgroundColor: c.background }}>
          <Button title={busy ? "Starting…" : "Start and invite friends"} icon="person.3.fill" onPress={() => void start_()} disabled={busy} />
        </View>
      }
    >
      <View style={{ gap: space.sm }}>
        <Text variant="display">Plan with friends</Text>
        <Text variant="body" tone="secondary">
          Everyone says when they&apos;re free, what they&apos;re into and what they can spend. Duro picks the day and one plan, with each person&apos;s order sized to their own budget. Nobody sees anyone else&apos;s.
        </Text>
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">What is it?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {OCCASIONS.map((o) => (
            <Chip key={o.id} label={o.label} selected={occasion === o.id} onPress={() => setOccasion(o.id)} />
          ))}
        </View>
        <Field value={title} onChangeText={setTitle} maxLength={80} placeholder="Give it a name (optional), e.g. Ama's birthday" />
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">Which days could work?</Text>
        <Segmented
          options={[
            { value: "range", label: "A run of days" },
            { value: "pick", label: "Pick days" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Text variant="subheadline" tone="secondary">
          {mode === "range"
            ? range.start && !range.end
              ? `From ${fmt(range.start)}. Now tap the last day (up to ${GROUP_MAX_DAYS}).`
              : start === rangeEnd
                ? `${fmt(start)}, just that day. Tap another day to start again.`
                : `${fmt(start)} to ${fmt(rangeEnd)}, ${spanDays(start, rangeEnd)} days`
            : picked.length
              ? `${picked.length} day${picked.length === 1 ? "" : "s"} picked, up to ${GROUP_MAX_PICKED}.`
              : `Tap the days that could work, up to ${GROUP_MAX_PICKED}.`}
        </Text>
        <RangeCalendar
          mode={mode}
          min={minDay}
          max={maxDay}
          range={range}
          onRange={setRange}
          picked={picked}
          onPicked={setPicked}
          maxSpan={GROUP_MAX_DAYS}
          maxPicked={GROUP_MAX_PICKED}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">Answers close</Text>
        {deadlines.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {deadlines.map((d) => (
              <Chip key={d.key} label={d.label} selected={deadline?.key === d.key} onPress={() => setDeadlineKey(d.key)} />
            ))}
          </View>
        ) : (
          <Text variant="footnote" tone="secondary">
            Pick a later first day so people have time to answer.
          </Text>
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="headline">How many people, roughly? (optional)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {SIZES.map((n) => (
            <Chip key={n} label={String(n)} selected={expected === n} onPress={() => setExpected(expected === n ? null : n)} />
          ))}
        </View>
        <Text variant="footnote" tone="secondary">
          We&apos;ll tell you when that many have answered.
        </Text>
      </View>

      <Field label="Your name, as your friends know you" value={name} onChangeText={setName} maxLength={24} />

      {error ? (
        <Text variant="subheadline" weight="600" style={{ color: c.danger }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
