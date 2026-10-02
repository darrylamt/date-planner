import { useEffect } from "react";
import { Platform, Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { GUTTER, radius, space } from "../../theme";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { swiftMods, swiftUI } from "../../lib/swiftUI";
import { chooseAction } from "../../lib/actionSheet";

const LAST_CITY = "duro.city.last";
const GLASS = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/**
 * Which city, as a menu on the city's own name.
 *
 * It was a segmented control above the list: two halves of a bar, a whole
 * row of the screen spent on a choice most people make once, and a shape
 * that stops working at the third city. Now the city sits under the
 * question as a button, "Accra" with a chevron, and the cities are in the
 * menu it opens: the phone's own, from the button, on iOS 26 in glass.
 * Without SwiftUI (build 22) the same button opens an action sheet.
 *
 * A new plan starts in the city chosen last time, which for somebody in
 * Kumasi is every time. Remembered on the phone, not looked up: the
 * location promise is that it is read when somebody taps for it, and
 * choosing a city for them unasked would break it.
 */
export function CityMenu({
  cities,
  city,
  chosen,
  onChange,
}: {
  cities: string[];
  city: string;
  /** Whether anywhere has been picked in this plan yet; until then the city is only the default. */
  chosen: boolean;
  onChange: (city: string) => void;
}) {
  const c = useTheme();
  const isDark = useIsDark();

  useEffect(() => {
    if (chosen) return;
    let live = true;
    AsyncStorage.getItem(LAST_CITY)
      .then((last) => {
        if (live && last && last !== city && cities.includes(last)) onChange(last);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Once per visit to the step, for a plan with no city yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(next: string) {
    if (next === city) return;
    void Haptics.selectionAsync();
    void AsyncStorage.setItem(LAST_CITY, next).catch(() => undefined);
    onChange(next);
  }

  const ui = swiftUI;
  const m = swiftMods;

  return (
    <View style={{ paddingHorizontal: GUTTER, marginBottom: space.lg, flexDirection: "row" }}>
      {ui && m ? (
        <ui.Host matchContents colorScheme={isDark ? "dark" : "light"} seedColor={c.accent}>
          <ui.Menu
            label={
              <ui.HStack spacing={6}>
                <ui.Image systemName="mappin.and.ellipse" size={14} />
                <ui.Text modifiers={[m.font({ size: 16, weight: "semibold" })]}>{city}</ui.Text>
                <ui.Image systemName="chevron.down" size={11} />
              </ui.HStack>
            }
            modifiers={[m.buttonStyle(GLASS ? "glass" : "bordered"), m.buttonBorderShape("capsule"), m.tint(c.accent)]}
          >
            {cities.map((name) => (
              <ui.Button
                key={name}
                label={name}
                systemImage={name === city ? "checkmark" : undefined}
                onPress={() => pick(name)}
              />
            ))}
          </ui.Menu>
        </ui.Host>
      ) : (
        <Pressable
          onPress={() =>
            chooseAction({
              title: "Which city?",
              actions: cities.map((name) => ({ text: name === city ? `${name} ✓` : name, onPress: () => pick(name) })),
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`City: ${city}. Change city`}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            borderRadius: radius.pill,
            backgroundColor: c.backgroundElement,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Symbol name="mappin.and.ellipse" size={14} color={c.accent} />
          <Text variant="callout" weight="600" style={{ color: c.accent }}>
            {city}
          </Text>
          <Symbol name="chevron.down" size={11} weight="semibold" color={c.accent} />
        </Pressable>
      )}
    </View>
  );
}
