import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { GUTTER, radius, space, type as typeScale } from "../theme";
import { useTheme } from "../lib/useTheme";
import { BUDGET_MAX as MAX, BUDGET_MIN as MIN, BUDGET_STEP as STEP } from "../lib/budget";

/**
 * Budget picker.
 *
 * The slider is the quick answer and the field is the exact one, a slider
 * stepping in fifties cannot express GHS 275, and someone who has a number in
 * mind should not have to approximate it. The big figure doubles as the
 * control's feedback while dragging, so the committed value only fires on
 * release rather than re-rendering the step every frame.
 *
 * Zero is a real answer, not an empty one: a walk on the beach, a free gallery
 * and a picnic someone packs themselves cost nothing, and refusing to accept
 * it made those days impossible to ask for.
 */
export function BudgetSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const c = useTheme();
  const [live, setLive] = useState(value);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(String(value));

  // Keep in step when the value changes elsewhere (e.g. a "raise budget"
  // nudge), but never yank the field out from under someone mid-type.
  useEffect(() => {
    setLive(value);
    if (!typing) setDraft(String(value));
  }, [value, typing]);

  function commitDraft() {
    setTyping(false);
    const digits = draft.replace(/[^0-9]/g, "");
    // An empty field means "I changed my mind", not "zero", zero has to be
    // typed to count.
    if (digits === "") {
      setDraft(String(value));
      return;
    }
    const next = Math.max(MIN, Math.min(MAX, Number(digits)));
    setDraft(String(next));
    setLive(next);
    onChange(next);
  }

  return (
    <View style={{ paddingHorizontal: GUTTER }}>
      <Text variant="largeTitle" center tabular style={{ fontSize: 44, lineHeight: 52 }}>
        GHS {live.toLocaleString()}
      </Text>

      <Slider
        style={{ marginTop: space.lg, height: 40 }}
        minimumValue={MIN}
        maximumValue={MAX}
        step={STEP}
        value={value}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.backgroundSelected}
        onValueChange={(v) => {
          if (v !== live) {
            setLive(v);
            void Haptics.selectionAsync();
          }
        }}
        onSlidingComplete={onChange}
      />

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="caption1" tone="tertiary" tabular>
          GHS {MIN}
        </Text>
        <Text variant="caption1" tone="tertiary" tabular>
          GHS {MAX.toLocaleString()}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          marginTop: space.lg,
        }}
      >
        <Text variant="footnote" tone="secondary">
          Or type it
        </Text>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.backgroundElement,
            borderRadius: radius.control,
            paddingHorizontal: space.md,
            height: 44,
          }}
        >
          <Text variant="body" tone="secondary">
            GHS{" "}
          </Text>
          <TextInput
            value={draft}
            onFocus={() => setTyping(true)}
            onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, ""))}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor={c.textTertiary}
            style={{
              flex: 1,
              color: c.text,
              fontSize: typeScale.body.fontSize,
              paddingVertical: 0,
            }}
          />
        </View>
      </View>

      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          setDraft("0");
          setLive(0);
          onChange(0);
        }}
        hitSlop={8}
        style={{ marginTop: space.md, alignSelf: "flex-start" }}
      >
        <Text variant="footnote" style={{ color: c.accent }}>
          Spending nothing
        </Text>
      </Pressable>
    </View>
  );
}
