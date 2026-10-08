import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Spacing } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { chooseAction } from "../../lib/actionSheet";
import { locationAvailable } from "../../lib/location";
import { fetchAreas } from "../../lib/data";

/** The city a plan starts in, shared with the plan flow's city menu (CityMenu). */
export const LAST_CITY = "duro.city.last";
/** Where "Where next" looks from: the phone's location, or an area of LAST_CITY. */
export const WHERE_FROM = "duro.where.from";

/**
 * Which city you are in, said on the home screen and changed in one tap.
 *
 * Somebody who planned a day in Kumasi and then opened "Where next" back in
 * Accra was searching Kumasi without knowing it, because the last city
 * planned in quietly became the city everything started from. This puts it
 * in plain sight above "Where next", with "Near me" as the other choice.
 */
export function CityChip() {
  const c = useTheme();
  const [city, setCity] = useState<string | null>(null);
  const [near, setNear] = useState(false);

  // Read again whenever home comes back into view: the plan flow can change it.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([AsyncStorage.getItem(LAST_CITY), AsyncStorage.getItem(WHERE_FROM)])
        .then(([c1, from]) => {
          if (!live) return;
          setCity(c1 || "Accra");
          setNear(from ? from === "near" : locationAvailable());
        })
        .catch(() => live && setCity("Accra"));
      return () => {
        live = false;
      };
    }, [])
  );

  async function change() {
    void Haptics.selectionAsync();
    const areas = await fetchAreas().catch(() => []);
    const cities = [...new Set(areas.map((a) => a.city || "Accra"))].sort((x, y) =>
      x === "Accra" ? -1 : y === "Accra" ? 1 : x.localeCompare(y)
    );
    if (!cities.length) cities.push("Accra");
    chooseAction({
      title: "Where are you?",
      message: "Where next and new plans start here.",
      actions: [
        ...(locationAvailable()
          ? [
              {
                text: near ? "Near me ✓" : "Near me",
                onPress: () => {
                  setNear(true);
                  void AsyncStorage.setItem(WHERE_FROM, "near").catch(() => undefined);
                },
              },
            ]
          : []),
        ...cities.map((name) => ({
          text: !near && name === city ? `${name} ✓` : name,
          onPress: () => {
            setCity(name);
            setNear(false);
            void AsyncStorage.multiSet([
              [LAST_CITY, name],
              [WHERE_FROM, "city"],
            ]).catch(() => undefined);
          },
        })),
      ],
    });
  }

  if (!city) return null;

  return (
    <Pressable
      onPress={() => void change()}
      accessibilityRole="button"
      accessibilityLabel={`You are in ${near ? "your current location" : city}. Change`}
      style={({ pressed }) => ({ alignSelf: "flex-start", marginBottom: Spacing.two, opacity: pressed ? 0.7 : 1 })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 7,
          paddingLeft: 10,
          paddingRight: 12,
          borderRadius: 999,
          backgroundColor: c.backgroundElement,
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <Symbol name={near ? "location.fill" : "mappin.and.ellipse"} size={14} color={c.accent} />
        <Text variant="subheadline" weight="600">
          {near ? "Near me" : city}
        </Text>
        <Symbol name="chevron.down" size={11} weight="semibold" color={c.textTertiary} />
      </View>
    </Pressable>
  );
}
