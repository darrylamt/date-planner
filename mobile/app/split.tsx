import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, Switch, TextInput, View } from "react-native";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { Segmented } from "../src/components/Segmented";
import { PeopleEditor } from "../src/components/fun/PeopleEditor";
import { GUTTER, HAIRLINE, radius, space, Spacing, type as typeScale } from "../src/theme";
import { useTheme } from "../src/lib/useTheme";
import { billLinkCode, billSource, splitBill } from "../src/lib/bill";
import { fetchProfile } from "../src/lib/account";
import { ghs } from "../src/lib/format";
import { isMe, rememberMomo, rememberNames, rememberedMomo, rememberedNames, startingNames } from "../src/lib/people";
import { afterSharing } from "../src/lib/review";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/**
 * Split the bill, evenly or by who had what.
 *
 * Opened from a plan, it starts from that plan's own orders, charges and
 * rides, because Duro already knows what was on the table. The real bill is
 * never exactly the plan, so the total from the receipt can be typed in and
 * every share moves with it. Opened from anywhere else it is a calculator:
 * type the total, choose who is in.
 *
 * It ends where the money actually moves in Accra: a message to the group
 * with each person's share and the mobile money number to send it to.
 */
export default function Split() {
  const c = useTheme();
  const source = useMemo(() => billSource(), []);
  const hasLines = Boolean(source?.lines.length);

  const [names, setNames] = useState<string[]>([]);
  const [mode, setMode] = useState<"even" | "items">("even");
  const [actualText, setActualText] = useState("");
  const [includeRides, setIncludeRides] = useState(true);
  const [sharedBy, setSharedBy] = useState<Record<string, number[]>>({});
  const [payer, setPayer] = useState(0);
  const [momo, setMomo] = useState("");

  useEffect(() => {
    void rememberedNames().then((saved) => setNames(startingNames(saved, source?.party ?? 2)));
    void rememberedMomo().then(setMomo);
  }, [source?.party]);

  // A name taken out means the lines it shared are shared by everyone else.
  function changeNames(next: string[]) {
    setNames(next);
    setSharedBy({});
    setPayer(0);
  }

  const extras = (source?.extras ?? []).reduce((s, e) => s + e.ghs, 0);
  const planned = (source?.lines ?? []).reduce((s, l) => s + l.ghs, 0) + extras;
  const actual = Number(actualText.replace(/[^\d.]/g, "")) || null;
  const rides = source?.rides ?? 0;
  const ready = names.length >= 2 && (source ? true : actual != null);

  const result = ready
    ? splitBill({
        people: names.length,
        mode: hasLines ? mode : "even",
        lines: source?.lines ?? [],
        sharedBy,
        extras,
        rides,
        includeRides: includeRides && rides > 0,
        actual: source ? actual : actual ?? 0,
        payer,
      })
    : null;

  function toggle(lineKey: string, person: number) {
    setSharedBy((cur) => {
      const now = cur[lineKey] ?? names.map((_, i) => i);
      const next = now.includes(person) ? now.filter((p) => p !== person) : [...now, person].sort();
      // Nobody is the same as everybody: a line must be paid by someone.
      return { ...cur, [lineKey]: next.length ? next : names.map((_, i) => i) };
    });
  }

  async function send() {
    if (!result) return;
    void rememberNames(names);
    if (momo.trim()) void rememberMomo(momo.trim());
    const rows = names.map((n, i) => (i === payer ? `${n}: ${ghs(result.shares[i])} (paid)` : `${n}: ${ghs(result.shares[i])}`));
    /*
     * A link to the bill's own page, for everybody in the chat without the
     * app: their share, the number to send it to, and what made it. "Me" is
     * nobody to the people reading it, so it becomes the sender's first name
     * when the account has one.
     */
    const me = (await fetchProfile().catch(() => null))?.displayName?.split(/\s+/)[0];
    const code = billLinkCode({
      title: source?.title,
      total: result.total,
      payer,
      momo: momo.trim() || undefined,
      people: names.map((n, i) => [isMe(n) && me ? me : n, result.shares[i]]),
    });
    const message = [
      `${source?.title ? `${source.title}: the` : "The"} bill 🧾`,
      `Total ${ghs(result.total)}`,
      "",
      ...rows,
      "",
      isMe(names[payer])
        ? `Send me your share${momo.trim() ? ` on MoMo: ${momo.trim()}` : ""}.`
        : `Send your share to ${names[payer]}${momo.trim() ? ` on MoMo: ${momo.trim()}` : ""}.`,
      "",
      ...(WEB_URL ? [`See it here: ${WEB_URL}/b/${code}`, ""] : []),
      "Split on Duro!",
    ].join("\n");
    const sent = await Share.share({ message });
    if (sent.action === Share.sharedAction) void afterSharing();
  }

  const input = {
    backgroundColor: c.backgroundElement,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: c.text,
    fontSize: typeScale.body.fontSize,
  } as const;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ paddingBottom: space.xxxl }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={{ paddingHorizontal: GUTTER, paddingTop: space.md }}>
        <Text variant="display">Split the bill</Text>
        <Text variant="body" tone="secondary" style={{ marginTop: Spacing.two }}>
          {source ? `From ${source.title}. Change the total if the bill said something different.` : "Type the total, choose who's in, and send everyone their share."}
        </Text>
      </View>

      <Section title="WHO'S IN">
        <PeopleEditor names={names} onChange={changeNames} />
      </Section>

      <Section title={source ? "THE BILL CAME TO" : "THE TOTAL"}>
        <TextInput
          value={actualText}
          onChangeText={setActualText}
          keyboardType="decimal-pad"
          placeholder={source ? `${Math.round(planned)}, from the plan` : "GHS"}
          placeholderTextColor={c.textTertiary}
          style={input}
        />
        <Text variant="caption1" tone="tertiary">
          {source ? "Food, drinks, entry and charges. Leave it empty to use the plan's prices." : "Everything on the receipt, service included."}
        </Text>
        {rides > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm }}>
            <Text variant="callout">Share the rides too ({ghs(rides)})</Text>
            <Switch value={includeRides} onValueChange={setIncludeRides} trackColor={{ true: c.accent }} />
          </View>
        ) : null}
      </Section>

      {hasLines ? (
        <Section title="HOW">
          <Segmented
            options={[
              { value: "even", label: "Evenly" },
              { value: "items", label: "By what they had" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Section>
      ) : null}

      {hasLines && mode === "items" ? (
        <Section title="WHO HAD WHAT">
          <Text variant="caption1" tone="tertiary">
            Tap names to say who shared each one. Everyone, unless you say otherwise. Charges follow what each person had.
          </Text>
          {source!.lines.map((l) => {
            const who = sharedBy[l.key] ?? names.map((_, i) => i);
            return (
              <View key={l.key} style={{ paddingVertical: space.sm, borderBottomWidth: HAIRLINE, borderBottomColor: c.border, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                  <Text variant="subheadline" weight="600" style={{ flex: 1 }} numberOfLines={2}>
                    {l.item}
                    {l.qty > 1 ? ` ×${l.qty}` : ""}
                    <Text variant="caption1" tone="tertiary">{`  ${l.stop}`}</Text>
                  </Text>
                  <Text variant="subheadline" tabular>
                    {ghs(l.ghs)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {names.map((n, i) => {
                    const on = who.includes(i);
                    return (
                      <Pressable
                        key={`${l.key}-${i}`}
                        onPress={() => toggle(l.key, i)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${n} had ${l.item}`}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: radius.pill,
                          backgroundColor: on ? c.accent : c.backgroundSelected,
                        }}
                      >
                        <Text variant="caption1" weight="600" style={{ color: on ? c.textOnBrand : c.textSecondary }}>
                          {n}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </Section>
      ) : null}

      {result ? (
        <Section title="EACH PERSON">
          <View style={{ borderRadius: radius.card, backgroundColor: c.backgroundElement, paddingHorizontal: space.lg }}>
            {names.map((n, i) => (
              <Pressable
                key={`${n}-${i}`}
                onPress={() => setPayer(i)}
                accessibilityRole="radio"
                accessibilityState={{ selected: payer === i }}
                accessibilityLabel={`${n} paid the bill`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: i < names.length - 1 ? HAIRLINE : 0,
                  borderBottomColor: c.border,
                }}
              >
                <Text variant="body" style={{ flex: 1 }}>
                  {n}
                  {payer === i ? (
                    <Text variant="footnote" tone="tint" weight="700">
                      {"  PAID"}
                    </Text>
                  ) : null}
                </Text>
                <Text variant="headline" tabular>
                  {ghs(result.shares[i])}
                </Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", paddingVertical: 12, borderTopWidth: HAIRLINE, borderTopColor: c.border }}>
              <Text variant="body" tone="secondary" style={{ flex: 1 }}>
                Total
              </Text>
              <Text variant="headline" tabular>
                {ghs(result.total)}
              </Text>
            </View>
          </View>
          <Text variant="caption1" tone="tertiary">
            Tap whoever paid. Everyone else sends them their share.
          </Text>
        </Section>
      ) : null}

      {result ? (
        <Section title="WHERE TO SEND IT">
          <TextInput
            value={momo}
            onChangeText={setMomo}
            keyboardType="phone-pad"
            placeholder={isMe(names[payer]) ? "Your MoMo number (optional)" : `${names[payer] ?? "Their"}'s MoMo number (optional)`}
            placeholderTextColor={c.textTertiary}
            style={input}
          />
          <Button title="Send everyone their share" icon="square.and.arrow.up" onPress={() => void send()} />
        </Section>
      ) : (
        <Text variant="footnote" tone="secondary" center style={{ marginTop: space.xl, paddingHorizontal: GUTTER }}>
          {names.length < 2 ? "Add at least two people." : "Type the total to see each person's share."}
        </Text>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl, gap: space.sm }}>
      <Text variant="footnote" weight="600" tone="secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}
