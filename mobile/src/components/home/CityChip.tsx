import { useCallback, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { radius, space, Spacing } from "../../theme";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { swiftMods, swiftUI } from "../../lib/swiftUI";
import { chooseAction } from "../../lib/actionSheet";
import { locationAvailable } from "../../lib/location";
import { fetchAreas } from "../../lib/data";

/** The city a plan starts in, shared with the plan flow's city menu (CityMenu). */
export const LAST_CITY = "duro.city.last";
/** Where "Where next" looks from: the phone's location, or an area of LAST_CITY. */
export const WHERE_FROM = "duro.where.from";
const NEAR_ME = "Near me";
const GLASS = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/**
 * Which city you are in, on the home screen, dressed exactly like the
 * questionnaire's city menu (CityMenu): the phone's own menu in a capsule,
 * glass on iOS 26, an action sheet behind the same pill elsewhere.
 *
 * Somebody who planned a day in Kumasi and then opened "Where next" back in
 * Accra was searching Kumasi without knowing it, because the last city
 * planned in quietly became the city everything started from. This puts it
 * in plain sight above "Where next", with "Near me" as the first choice.
 */
export function CityChip() {
  const c = useTheme();
  const isDark = useIsDark();
  const [city, setCity] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const [cities, setCities] = useState<string[]>(["Accra"]);

  // Read again whenever home comes back into view: the plan flow can change it.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([AsyncStorage.getItem(LAST_CITY), AsyncStorage.getItem(WHERE_FROM)])
        .then(([c1, from]) => {
          if (!live) return;
          setCity(c1 || "Accra");
          setNear(from ? from === "near" && locationAvailable() : locationAvailable());
        })
        .catch(() => live && setCity("Accra"));
      void fetchAreas()
        .then((areas) => {
          if (!live) return;
          const names = [...new Set(areas.map((a) => a.city || "Accra"))].sort((x, y) =>
            x === "Accra" ? -1 : y === "Accra" ? 1 : x.localeCompare(y)
          );
          if (names.length) setCities(names);
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, [])
  );

  function pick(next: string) {
    void Haptics.selectionAsync();
    if (next === NEAR_ME) {
      setNear(true);
      void AsyncStorage.setItem(WHERE_FROM, "near").catch(() => undefined);
      return;
    }
    setCity(next);
    setNear(false);
    void AsyncStorage.multiSet([
      [LAST_CITY, next],
      [WHERE_FROM, "city"],
    ]).catch(() => undefined);
  }

  if (!city) return null;
  const label = near ? NEAR_ME : city;
  const options = [...(locationAvailable() ? [NEAR_ME] : []), ...cities];
  const ui = swiftUI;
  const m = swiftMods;

  return (
    <View style={{ marginBottom: Spacing.two, flexDirection: "row" }}>
      {ui && m ? (
        <ui.Host matchContents colorScheme={isDark ? "dark" : "light"} seedColor={c.accent}>
          <ui.Menu
            label={
              <ui.HStack spacing={6}>
                <ui.Image systemName={near ? "location.fill" : "mappin.and.ellipse"} size={14} />
                <ui.Text modifiers={[m.font({ size: 16, weight: "semibold" })]}>{label}</ui.Text>
                <ui.Image systemName="chevron.down" size={11} />
              </ui.HStack>
            }
            modifiers={[m.buttonStyle(GLASS ? "glass" : "bordered"), m.buttonBorderShape("capsule"), m.tint(c.accent)]}
          >
            {options.map((name) => (
              <ui.Button
                key={name}
                label={name}
                systemImage={name === label ? "checkmark" : name === NEAR_ME ? "location" : undefined}
                onPress={() => pick(name)}
              />
            ))}
          </ui.Menu>
        </ui.Host>
      ) : (
        <Pressable
          onPress={() =>
            chooseAction({
              title: "Where are you?",
              message: "Where next and new plans start here.",
              actions: options.map((name) => ({ text: name === label ? `${name} ✓` : name, onPress: () => pick(name) })),
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`You are in ${near ? "your current location" : city}. Change`}
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
          <Symbol name={near ? "location.fill" : "mappin.and.ellipse"} size={14} color={c.accent} />
          <Text variant="callout" weight="600" style={{ color: c.accent }}>
            {label}
          </Text>
          <Symbol name="chevron.down" size={11} weight="semibold" color={c.accent} />
        </Pressable>
      )}
    </View>
  );
}
