import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Symbol } from "../Symbol";
import { useAppearance, useLook } from "../../lib/appearance";
import { KENTE, LOOK_CHOICES, type LookChoice } from "../../lib/looks";
import { Body, Display } from "../look";

/** A small picture of each look, so the choice is seen rather than read. */
function Preview({ id }: { id: LookChoice }) {
  const frame = { width: 58, height: 76, borderRadius: 14, overflow: "hidden" as const };
  if (id === "kente")
    return (
      <View style={[frame, { backgroundColor: KENTE.black }]}>
        <View style={{ flexDirection: "row", height: 8 }}>
          {[KENTE.gold, KENTE.green, KENTE.red, KENTE.gold, KENTE.green, KENTE.red].map((c, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </View>
        <View style={{ margin: 8, marginTop: 14, height: 22, borderRadius: 6, backgroundColor: KENTE.gold }} />
        <View style={{ marginHorizontal: 8, height: 6, borderRadius: 3, backgroundColor: "rgba(247,241,227,0.35)" }} />
      </View>
    );
  if (id === "night")
    return (
      <LinearGradient colors={["#2E1D52", "#0C0A16"]} style={frame}>
        <View style={{ margin: 8, marginTop: 22, height: 22, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.16)" }} />
        <View style={{ marginHorizontal: 8, height: 6, borderRadius: 3, backgroundColor: "#FFB547" }} />
      </LinearGradient>
    );
  if (id === "daylight")
    return (
      <View style={[frame, { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#ECEDF1" }]}>
        <View style={{ margin: 8, marginTop: 22, height: 22, borderRadius: 6, backgroundColor: "#0B0B0F" }} />
        <View style={{ marginHorizontal: 8, height: 6, borderRadius: 3, backgroundColor: "#E11D48" }} />
      </View>
    );
  return (
    <View style={[frame, { flexDirection: "row" }]}>
      <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />
      <LinearGradient colors={["#2E1D52", "#0C0A16"]} style={{ flex: 1 }} />
    </View>
  );
}

/**
 * The look, chosen from pictures of it (redesign, 3 Nov 2026): Kente,
 * Night, Daylight, or the sky. Every screen works the same in each.
 */
export function LookPicker() {
  const look = useLook();
  const { choice, setLook } = useAppearance();
  return (
    <View style={{ gap: 10 }}>
      {LOOK_CHOICES.map((l) => {
        const on = choice === l.id;
        return (
          <Pressable
            key={l.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${l.title}. ${l.sub}`}
            onPress={() => {
              void Haptics.selectionAsync();
              setLook(l.id);
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              padding: 12,
              borderRadius: 22,
              borderWidth: on ? 2 : 1,
              borderColor: on ? look.primary : look.tileEdge,
              backgroundColor: on ? look.tile : "transparent",
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Preview id={l.id} />
            <View style={{ flex: 1, gap: 2 }}>
              <Display size={18} weight="700">
                {l.title}
              </Display>
              <Body size={13} tone="secondary">
                {l.sub}
              </Body>
            </View>
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                borderWidth: on ? 0 : 1.5,
                borderColor: look.tileEdge,
                backgroundColor: on ? look.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {on ? <Symbol name="checkmark" size={13} weight="bold" color={look.onPrimary} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
