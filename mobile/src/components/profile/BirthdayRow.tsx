import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "../Text";
import { Button } from "../Button";
import { NativeSheet } from "../native/NativeSheet";
import { Chip } from "../Chip";
import { useTheme } from "../../lib/useTheme";
import { GUTTER, radius, space } from "../../theme";
import { updateBirthday } from "../../lib/account";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Tell us your birthday, or do not.
 *
 * ── asked here rather than at signup ────────────────────────────────────
 * A date of birth demanded at the door reads as data collection, because at
 * that moment it is: nothing has been offered in return and there is no
 * context to explain it. The same field on your own profile, under a sentence
 * saying what it is for, reads as a reason. It is also genuinely optional in a
 * way a signup field never quite is.
 *
 * ── day and month, never a year ─────────────────────────────────────────
 * The only thing this is for is knowing which morning to send a message on. A
 * year would let the app work out an age, which nothing here needs, and asking
 * for what you do not need is how a nice touch becomes a privacy disclosure
 * nobody wanted. The absence of the field is the promise.
 */
export function BirthdayRow({
  day,
  month,
  onSaved,
}: {
  day: number | null;
  month: number | null;
  onSaved: (day: number | null, month: number | null) => void;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftDay, setDraftDay] = useState(day ?? 1);
  const [draftMonth, setDraftMonth] = useState(month ?? 1);

  const set = day != null && month != null;
  const shown = set ? `${day} ${MONTHS[(month as number) - 1]}` : "Not set";

  /*
   * Days offered for the month chosen, so 31 February cannot be picked. The
   * leap day stays available: it is stored as given and greeted on the 28th in
   * years without a 29th, which is what people do themselves.
   */
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][draftMonth - 1];
  const safeDay = Math.min(draftDay, daysInMonth);

  async function save(clear = false) {
    setBusy(true);
    const nextDay = clear ? null : safeDay;
    const nextMonth = clear ? null : draftMonth;
    const ok = await updateBirthday(nextDay, nextMonth);
    setBusy(false);
    if (ok) {
      onSaved(nextDay, nextMonth);
      setOpen(false);
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: 10,
          minHeight: 44,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="body">Birthday</Text>
          <Text variant="footnote" tone="secondary">
            So we can say so on the day. Day and month only.
          </Text>
        </View>
        <Text variant="body" tone={set ? "secondary" : "tertiary"}>
          {shown}
        </Text>
      </Pressable>

      {/*
        Sized to what is in it: a title, the month and day, and the buttons, where a
        page sheet put them at the top of a screen of empty background.
      */}
      <NativeSheet visible={open} onClose={() => setOpen(false)}>
        <View style={{ paddingTop: space.md }}>
          <Text variant="title2" style={{ paddingHorizontal: GUTTER }}>
            Your birthday
          </Text>
          <Text
            variant="footnote"
            tone="secondary"
            style={{ paddingHorizontal: GUTTER, marginTop: space.xs }}
          >
            We ask for the day and the month, and not the year. There is nothing here that needs
            to know how old you are.
          </Text>

          {/* The month as chips, then its days as a grid: two taps, no spinning. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: GUTTER, marginTop: space.xl }}>
            {MONTHS.map((m, i) => (
              <Chip key={m} label={m.slice(0, 3)} selected={draftMonth === i + 1} onPress={() => setDraftMonth(i + 1)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: GUTTER, marginTop: space.lg }}>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const on = d === safeDay;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDraftDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${d} ${MONTHS[draftMonth - 1]}`}
                  style={{ width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: on ? c.text : "transparent",
                    }}
                  >
                    <Text variant="subheadline" weight={on ? "700" : "500"} style={{ color: on ? c.background : c.text }}>
                      {d}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View
            style={{
              marginTop: space.xl,
              paddingHorizontal: GUTTER,
              paddingBottom: space.md,
              gap: space.sm,
            }}
          >
            <Button
              title={busy ? "Saving…" : "Save"}
              onPress={() => void save()}
              disabled={busy}
            />
            {/* Only where there is something to remove, so the sheet does not
                offer to clear a field that is already empty. */}
            {set ? (
              <Button
                title="Remove my birthday"
                kind="plain"
                onPress={() => void save(true)}
                disabled={busy}
              />
            ) : null}
            <Button title="Cancel" kind="plain" onPress={() => setOpen(false)} disabled={busy} />
          </View>
        </View>
      </NativeSheet>
    </>
  );
}
