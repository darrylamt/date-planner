import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { View } from "react-native";
import { Text } from "./Text";
import { GUTTER, space } from "../theme";
import { useTheme } from "../lib/useTheme";

/** Native iOS segmented control with an optional label above it. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useTheme();
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? (
        <Text variant="footnote" tone="secondary" style={{ marginBottom: space.sm }}>
          {label}
        </Text>
      ) : null}
      <SegmentedControl
        values={options.map((o) => o.label)}
        selectedIndex={index}
        onChange={(e) => onChange(options[e.nativeEvent.selectedSegmentIndex].value)}
        tintColor={c.backgroundElement}
        backgroundColor={c.backgroundSelected}
        fontStyle={{ color: c.text }}
        activeFontStyle={{ color: c.text, fontWeight: "600" }}
        style={{ height: 36 }}
      />
    </View>
  );
}

/**
 * Wrapping chip row — for multi-select where a segmented control would
 * overflow (vibes, durations with many options).
 */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: space.sm,
        paddingHorizontal: GUTTER,
      }}
    >
      {children}
    </View>
  );
}
