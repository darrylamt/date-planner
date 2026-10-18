import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Share, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { Symbol } from "../../src/components/Symbol";
import { GroupAnswerForm } from "../../src/components/group/GroupAnswerForm";
import { YourOrder } from "../../src/components/group/YourOrder";
import { GUTTER, HAIRLINE, radius, space } from "../../src/theme";
import { useTheme } from "../../src/lib/useTheme";
import {
  answerGroup,
  getGroup,
  getMe,
  groupLink,
  lockGroup,
  organiserView,
  recommend,
  removeMember,
} from "../../src/lib/groupApi";
import { SLOT_LABEL, type GroupAnswer, type GroupMe, type GroupOrganiserView, type GroupPublic } from "../../src/lib/groups";

/**
 * One group outing, from wherever you stand in it.
 *
 * Not answered yet: the questions. Answered: "you're in" and who else is.
 * Organiser: who has answered, when people can make it, and the plan, with
 * Try another and Lock it in. Locked: the evening and your own order.
 * Nothing here ever shows anyone else's budget or order; the server never
 * sends them.
 */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

function Card({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View
      style={{
        padding: space.lg,
        borderRadius: radius.card,
        backgroundColor: c.backgroundElement,
        borderWidth: HAIRLINE,
        borderColor: c.border,
        gap: space.sm,
      }}
    >
      {children}
    </View>
  );
}

export default function GroupScreen() {
  const c = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [group, setGroup] = useState<GroupPublic | null>(null);
  const [me, setMe] = useState<GroupMe | null>(null);
  const [org, setOrg] = useState<GroupOrganiserView | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noMatch, setNoMatch] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!code) return;
    const pub = await getGroup(code);
    if (!pub.ok) {
      setMissing(true);
      return;
    }
    setGroup(pub.data);
    const mine = await getMe(code);
    const meNow = mine.ok ? mine.data : null;
    setMe(meNow);
    if (meNow?.isOrganiser) {
      const o = await organiserView(code);
      if (o.ok) setOrg(o.data);
    }
  }, [code]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function submit(answer: GroupAnswer) {
    if (!code) return;
    setBusy(true);
    setError(null);
    const r = await answerGroup(code, answer);
    setBusy(false);
    if (!r.ok) {
      return setError(
        r.error === "name_taken"
          ? "Someone in the group already has that name. Add an initial."
          : r.error === "group_full"
            ? "This group is full."
            : r.error === "locked"
              ? "The plan is already set."
              : r.error === "name"
                ? "Use letters and numbers for your name."
                : "That didn't send. Check your connection and try again."
      );
    }
    setEditing(false);
    await load();
  }

  async function plan() {
    if (!code) return;
    setBusy(true);
    setNoMatch(null);
    const r = await recommend(code, { ai: true });
    setBusy(false);
    if (!r.ok) return setNoMatch(r.error === "slow_down" ? "That's a lot of plans for one day. Try again tomorrow." : "We couldn't reach Duro. Try again.");
    if (r.data.status === "not_enough") return setNoMatch("Two or more people need to be free at the same time first.");
    if (r.data.status === "no_match") return setNoMatch(r.data.message);
    await load();
  }

  async function lock(planId: string) {
    if (!code) return;
    setBusy(true);
    const r = await lockGroup(code, planId);
    setBusy(false);
    if (!r.ok) {
      if (r.error === "stale") {
        setNoMatch("Someone changed their answer. Get a fresh plan, then lock it in.");
        return void load();
      }
      return setNoMatch("That didn't lock. Try again.");
    }
    router.replace(`/plan/${r.data.slug}`);
  }

  function invite() {
    if (!code || !group) return;
    void Share.share({
      message: `I'm planning ${group.title || "something"} on Duro! Say when you're free and what you're into, your budget stays private: ${groupLink(code)}`,
    });
  }

  function confirmRemove(id: string, name: string) {
    Alert.alert(`Remove ${name}?`, "Their answer goes. They can answer again from the link.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void removeMember(code!, id).then(() => load()),
      },
    ]);
  }

  if (missing) {
    return (
      <Screen contentStyle={{ paddingHorizontal: GUTTER, paddingTop: space.lg, gap: space.md }}>
        <Text variant="title2">This group isn&apos;t here any more</Text>
        <Text variant="body" tone="secondary">
          It may have been called off by whoever started it.
        </Text>
      </Screen>
    );
  }
  if (!group) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  const answered = Boolean(me?.answer) && !editing;
  const heading = group.title || "A group outing";
  const locked = group.status === "locked" && group.locked;
  const proposal = org?.proposal ?? null;

  return (
    <Screen contentStyle={{ paddingHorizontal: GUTTER, paddingTop: space.md, gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="display">{heading}</Text>
        <Text variant="body" tone="secondary">
          {locked
            ? `Planned by ${group.organiser}.`
            : me?.isOrganiser
              ? `Answers close ${new Date(group.deadline).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit" })}.`
              : `${group.organiser} is planning this. Say when you're free and what you're into.`}
        </Text>
        {group.answered.length ? (
          <Text variant="footnote" tone="secondary">
            In so far: {group.answered.join(", ")}
          </Text>
        ) : null}
      </View>

      {locked ? (
        <>
          <Card>
            <Text variant="title3">{group.locked!.title}</Text>
            <Text variant="subheadline" tone="secondary">
              {dayLabel(group.locked!.date)}, from {group.locked!.startTime}
            </Text>
            {group.locked!.stops.map((s, i) => (
              <View key={i} style={{ paddingTop: space.sm, gap: 2 }}>
                <Text variant="caption1" weight="700" style={{ color: c.accent }}>
                  {s.arrival_time} · {s.label}
                </Text>
                <Text variant="headline">{s.name}</Text>
                <Text variant="footnote" tone="secondary">
                  {s.area}
                </Text>
              </View>
            ))}
          </Card>
          {me?.order ? <YourOrder order={me.order} /> : null}
          {me?.isOrganiser ? (
            <Button title="Open the plan" onPress={() => router.push(`/plan/${group.locked!.slug}`)} />
          ) : (
            <Button
              title="Share the plan"
              kind="tinted"
              icon="square.and.arrow.up"
              onPress={() => void Share.share({ message: `${group.locked!.title}: ${groupLink(group.code).replace(/\/g\/.*/, "")}/p/${group.locked!.slug}` })}
            />
          )}
        </>
      ) : !answered ? (
        <GroupAnswerForm
          group={group}
          initial={me?.answer ?? null}
          defaultName=""
          busy={busy}
          error={error}
          onSubmit={(a) => void submit(a)}
        />
      ) : me?.isOrganiser && org ? (
        <>
          <Button title="Invite friends" kind="tinted" icon="square.and.arrow.up" onPress={invite} />

          <Card>
            <Text variant="headline">Who&apos;s answered</Text>
            {org.members.map((m) => (
              <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Symbol name={m.answered ? "checkmark.circle.fill" : "circle"} size={16} color={m.answered ? c.success : c.textTertiary} />
                <Text variant="body" style={{ flex: 1 }}>
                  {m.name}
                  {m.isOrganiser ? " (you)" : ""}
                </Text>
                {m.isOrganiser ? null : (
                  <Pressable hitSlop={8} onPress={() => confirmRemove(m.id, m.name)}>
                    <Text variant="footnote" tone="secondary">
                      Remove
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </Card>

          <Card>
            <Text variant="headline">When people can make it</Text>
            {[...org.tally]
              .filter((t) => t.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, 4)
              .map((t) => (
                <View key={`${t.date}-${t.slot}`} style={{ gap: 2 }}>
                  <Text variant="body" weight="600">
                    {dayLabel(t.date)}, {SLOT_LABEL[t.slot].toLowerCase()}: {t.count}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {t.names.join(", ")}
                  </Text>
                </View>
              ))}
            {org.vibes.length ? (
              <Text variant="footnote" tone="secondary">
                Into: {org.vibes.map((v) => `${v.vibe} (${v.count})`).join(", ")}
              </Text>
            ) : null}
          </Card>

          {proposal ? (
            <Card>
              <Text variant="headline">
                {dayLabel(proposal.date)}, {SLOT_LABEL[proposal.slot].toLowerCase()}
              </Text>
              <Text variant="title3">{proposal.itinerary.title}</Text>
              {proposal.itinerary.stops.map((s, i) => (
                <View key={i} style={{ paddingTop: space.xs, gap: 2 }}>
                  <Text variant="caption1" weight="700" style={{ color: c.accent }}>
                    {s.arrival_time} · {s.label}
                  </Text>
                  <Text variant="body" weight="600">
                    {s.name}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {s.area}
                    {s.own_orders ? " · everyone orders their own" : ""}
                  </Text>
                </View>
              ))}
              <Text variant="footnote" tone="secondary" style={{ marginTop: space.sm }}>
                Going: {proposal.attending.join(", ")}
                {proposal.away.length ? `. Can't make it: ${proposal.away.join(", ")}` : ""}
              </Text>
              {proposal.stale ? (
                <Text variant="footnote" weight="600" style={{ color: c.danger }}>
                  Someone changed their answer since. Get a fresh plan before locking.
                </Text>
              ) : null}
            </Card>
          ) : null}
          {proposal && me?.order ? <YourOrder order={me.order} /> : null}

          {noMatch ? (
            <Text variant="subheadline" weight="600" style={{ color: c.danger }}>
              {noMatch}
            </Text>
          ) : null}

          <View style={{ gap: space.sm }}>
            {proposal && !proposal.stale ? (
              <Button title={busy ? "Locking…" : "Lock it in"} icon="lock.fill" onPress={() => void lock(proposal.planId)} disabled={busy} />
            ) : null}
            <Button
              title={busy ? "Planning…" : proposal ? "Try another" : "Get a plan"}
              kind={proposal && !proposal.stale ? "gray" : "filled"}
              icon="sparkles"
              onPress={() => void plan()}
              disabled={busy}
            />
            <Button title="Change my answer" kind="plain" onPress={() => setEditing(true)} />
          </View>
        </>
      ) : (
        <Card>
          <Text style={{ fontSize: 36, textAlign: "center" }}>🙌</Text>
          <Text variant="title2" style={{ textAlign: "center" }}>
            You&apos;re in
          </Text>
          <Text variant="body" tone="secondary" style={{ textAlign: "center" }}>
            When {group.organiser} locks the plan, it shows here with your own order, sized to your budget.
          </Text>
          <Button title="Change my answer" kind="plain" onPress={() => setEditing(true)} />
        </Card>
      )}
    </Screen>
  );
}
