import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Symbol } from "../Symbol";
import { GUTTER } from "../../theme";
import { useLook } from "../../lib/appearance";
import { DESTINATIONS, type Destination } from "../../lib/tripMock";
import { Body, Display } from "../look";

/** "Sample", said on every screen of the preview, so nobody reads it as a real price. */
export function SampleBadge() {
  const look = useLook();
  return (
    <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: look.colors.accent }}>
      <Symbol name="eye" size={12} color={look.colors.accent} />
      <Body size={12} weight="700" color={look.colors.accent}>
        Preview with sample prices
      </Body>
    </View>
  );
}

/** A destination's picture, until destinations have photos: its colours and its mark. */
export function DestinationTile({ d, width, height, onPress }: { d: Destination; width: number; height: number; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${d.name}, ${d.region}. ${d.live ? d.blurb : "Coming soon"}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ width, height, borderRadius: 26, overflow: "hidden", transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <LinearGradient colors={d.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 16, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Symbol name={d.icon} size={26} color="rgba(255,255,255,0.92)" />
          {d.live ? null : (
            <View style={{ paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center" }}>
              <Body size={11} weight="700" color="#FFFFFF">
                Coming soon
              </Body>
            </View>
          )}
        </View>
        <View>
          <Display size={24} weight="800" color="#FFFFFF">
            {d.name}
          </Display>
          <Body size={13} weight="600" color="rgba(255,255,255,0.85)">
            {d.region}
          </Body>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Trips, on Home (the Outings | Trips switch): plan a trip, or start from a
 * destination. A preview on sample data until the trip engine exists.
 */
export function TripsHome() {
  const look = useLook();
  const go = (d: Destination) => {
    void Haptics.selectionAsync();
    if (!d.live) {
      Alert.alert(`We're still building ${d.name}`, "Places to stay and ways to get there are on their way. We'll let you know when it's ready.");
      return;
    }
    router.push(`/trip/new?to=${d.id}`);
  };
  return (
    <View style={{ gap: 18 }}>
      <SampleBadge />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Plan a trip"
        onPress={() => router.push("/trip/new")}
        style={({ pressed }) => ({
          height: 136,
          borderRadius: 28,
          backgroundColor: look.sky ? look.tile : look.primary,
          borderWidth: look.sky ? 1 : 0,
          borderColor: look.tileEdge,
          padding: 20,
          justifyContent: "space-between",
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Display size={28} weight="700" color={look.sky ? look.colors.text : look.onPrimary}>
            Plan a trip
          </Display>
          <Symbol name="suitcase.fill" size={26} color={look.sky ? look.primary : look.onPrimary} />
        </View>
        <Body size={15} weight="500" color={look.sky ? look.colors.textSecondary : look.onPrimary}>
          Getting there, where to stay, and every day planned.
        </Body>
      </Pressable>
      <Display size={20} weight="700">
        Where to?
      </Display>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: GUTTER }} style={{ marginRight: -GUTTER }}>
        {DESTINATIONS.map((d) => (
          <DestinationTile key={d.id} d={d} width={200} height={240} onPress={() => go(d)} />
        ))}
      </ScrollView>
    </View>
  );
}
