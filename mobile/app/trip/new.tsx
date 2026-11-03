import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER } from "../../src/theme";
import { useLook } from "../../src/lib/appearance";
import { DESTINATIONS, type TravelMode } from "../../src/lib/tripMock";
import { DayPicker } from "../../src/components/redesign/Questions2";
import { DestinationTile, SampleBadge } from "../../src/components/redesign/TripsHome";
import { Body, Display, LookButton, LookScreen, RoundButton } from "../../src/components/look";

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Plan a trip (a preview on sample data, 3 Nov 2026): where, when, how many
 * nights, who, how comfortable, and how to get there, on one screen, in the
 * redesign's controls. Build opens the trip.
 */
export default function TripNew() {
  const look = useLook();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ to?: string }>();
  const live = DESTINATIONS.filter((d) => d.live);
  const [to, setTo] = useState(live.find((d) => d.id === params.to)?.id ?? live[0].id);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
    return isoOf(d);
  });
  const [nights, setNights] = useState(2);
  const [people, setPeople] = useState(2);
  const [comfort, setComfort] = useState<"easy" | "mid" | "treat">("mid");
  const [travel, setTravel] = useState<"any" | TravelMode>("any");

  const counter = (label: string, value: number, set: (n: number) => void, min: number, max: number, unit: (n: number) => string) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
      <View>
        <Display size={18} weight="700">
          {label}
        </Display>
        <Body size={13} tone="secondary">
          {unit(value)}
        </Body>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <RoundButton label={`Fewer ${label.toLowerCase()}`} onPress={() => value > min && set(value - 1)}>
          <Symbol name="minus" size={16} weight="bold" color={look.colors.text} />
        </RoundButton>
        <Display size={28} weight="800" style={{ minWidth: 28, textAlign: "center" }}>
          {String(value)}
        </Display>
        <RoundButton label={`More ${label.toLowerCase()}`} onPress={() => value < max && set(value + 1)} filled>
          <Symbol name="plus" size={16} weight="bold" color={look.onPrimary} />
        </RoundButton>
      </View>
    </View>
  );

  const choice = <T extends string>(options: { id: T; label: string }[], value: T, set: (v: T) => void) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync();
              set(o.id);
            }}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: "center", backgroundColor: on ? look.primary : "transparent", borderWidth: 1, borderColor: on ? look.primary : look.tileEdge }}
          >
            <Body size={14} weight="700" color={on ? look.onPrimary : look.colors.text}>
              {o.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <LookScreen band="thin">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: look.band ? Math.max(insets.top - 6, 12) : insets.top + 8, paddingHorizontal: GUTTER, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <RoundButton label="Close" onPress={() => router.back()}>
          <Symbol name="xmark" size={16} weight="bold" color={look.colors.text} />
        </RoundButton>
        <SampleBadge />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 140, gap: 26 }}>
        <Display size={38} weight="700">
          Plan a trip
        </Display>

        <View style={{ gap: 12 }}>
          <Display size={20} weight="700">
            Where to?
          </Display>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginRight: -GUTTER }}>
            {live.map((d) => (
              <View key={d.id} style={{ borderRadius: 28, borderWidth: 3, borderColor: d.id === to ? look.primary : "transparent", padding: 2 }}>
                <DestinationTile d={d} width={150} height={170} onPress={() => setTo(d.id)} />
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 12 }}>
          <Display size={20} weight="700">
            Arriving
          </Display>
          <DayPicker value={date} onChange={setDate} />
        </View>

        <View style={{ gap: 6 }}>
          {counter("Nights", nights, setNights, 1, 7, (n) => (n === 1 ? "One night" : `${n} nights`))}
          {counter("People", people, setPeople, 1, 8, (n) => (n === 1 ? "Just you" : `${n} of you`))}
        </View>

        <View style={{ gap: 12 }}>
          <Display size={20} weight="700">
            How comfortable?
          </Display>
          {choice(
            [
              { id: "easy", label: "Easy on the wallet" },
              { id: "mid", label: "Comfortable" },
              { id: "treat", label: "Treat ourselves" },
            ],
            comfort,
            setComfort
          )}
        </View>

        <View style={{ gap: 12 }}>
          <Display size={20} weight="700">
            Getting there
          </Display>
          {choice(
            [
              { id: "any" as const, label: "Whatever's best" },
              { id: "bus" as const, label: "Coach" },
              { id: "car" as const, label: "Car with a driver" },
              { id: "flight" as const, label: "Fly" },
            ],
            travel,
            setTravel
          )}
        </View>
      </ScrollView>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: look.colors.background, borderTopWidth: 1, borderTopColor: look.tileEdge }}>
        <LookButton
          label="Build my trip"
          onPress={() => router.replace(`/trip/${to}?nights=${nights}&people=${people}&date=${date}&travel=${travel}`)}
        />
      </View>
    </LookScreen>
  );
}
