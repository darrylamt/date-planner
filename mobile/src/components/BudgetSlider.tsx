import { useEffect, useState } from "react";
import { View } from "react-native";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { GUTTER, space } from "../theme";
import { useTheme } from "../lib/useTheme";
import { BUDGET_MAX as MAX, BUDGET_MIN as MIN, BUDGET_STEP as STEP } from "../lib/budget";

/**
 * Budget picker. The big figure is the control's real feedback, so it updates
 * live while dragging; the committed value only fires on release to avoid
 * re-rendering the whole step on every frame.
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

  // Keep in step when the value changes elsewhere (e.g. a "raise budget" nudge).
  useEffect(() => setLive(value), [value]);

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
    </View>
  );
}
