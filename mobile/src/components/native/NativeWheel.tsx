import { View } from "react-native";
import { Text } from "../Text";
import { WheelPicker, type WheelOption } from "../WheelPicker";
import { Spacing } from "../../theme";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { swiftMods, swiftUI } from "../../lib/swiftUI";

/**
 * The iPhone's own wheel, where the build has SwiftUI; the drawn one where
 * it does not (see swiftUI.ts). Same props as WheelPicker, so a screen swaps
 * one for the other and nothing else changes.
 *
 * The drawn wheel was a ScrollView snapping to rows with a haptic on settle.
 * The real one has the physics, the click under the thumb, VoiceOver's
 * adjustable gestures and Dynamic Type for free, and it is what every other
 * time and number on the phone is picked with.
 *
 * Tags are strings even for numbers. A number crosses to Swift as either an
 * Int or a Double depending on its value, and a selection of 3 that arrives
 * as a Double does not match a tag of 3 that arrived as an Int: the wheel
 * shows no selection at all. Strings compare the one way.
 */
export function NativeWheel<T extends string | number>(props: {
  options: WheelOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Static label beside the wheel, e.g. "people". */
  suffix?: string;
}) {
  const c = useTheme();
  const isDark = useIsDark();
  const ui = swiftUI;
  const m = swiftMods;
  if (!ui || !m) return <WheelPicker {...props} />;

  const { options, value, onChange, suffix } = props;
  const byKey = new Map(options.map((o) => [String(o.value), o.value]));

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <ui.Host
        matchContents={{ vertical: true }}
        colorScheme={isDark ? "dark" : "light"}
        seedColor={c.accent}
        style={{ flex: 1, maxWidth: suffix ? 220 : 320 }}
      >
        <ui.Picker
          selection={String(value)}
          onSelectionChange={(key) => {
            const next = byKey.get(String(key));
            if (next !== undefined && next !== value) onChange(next);
          }}
          modifiers={[m.pickerStyle("wheel"), m.labelsHidden()]}
        >
          {options.map((o) => (
            <ui.Text key={String(o.value)} modifiers={[m.tag(String(o.value))]}>
              {o.label}
            </ui.Text>
          ))}
        </ui.Picker>
      </ui.Host>
      {suffix ? (
        <Text variant="title3" tone="secondary" style={{ marginLeft: Spacing.two }}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}
