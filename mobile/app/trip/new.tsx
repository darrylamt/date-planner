import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER } from "../../src/theme";
import { useLook } from "../../src/lib/appearance";
import { fetchTripPlaces, type TripComfort, type TripPlace, type TripTravel } from "../../src/lib/api";
import { DayPicker } from "../../src/components/redesign/Questions2";
import { PlaceTile } from "../../src/components/redesign/TripsHome";
import { Body, Display, LookButton, LookScreen, RoundButton } from "../../src/components/look";
import { fetchAllowance } from "../../src/lib/chat";

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Plan a trip: where (the researched places, 0101), when, how many nights,
 * who, how comfortable, and how to get there, on one screen, in the
 * redesign's controls. Build opens the trip, which the server plans.
 */
export default function TripNew() {
  const look = useLook();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ to?: string }>();
  const [places, setPlaces] = useState<TripPlace[]>([]);
  const [to, setTo] = useState(params.to ?? "");
  // Free accounts plan one trip a month (the server's /api/trip/generate); said before they build.
  const [pro, setPro] = useState<boolean | null>(null);
  useEffect(() => {
    void fetchAllowance()
      .then((a) => setPro(a?.tier === "pro"))
      .catch(() => setPro(null));
  }, []);
  useEffect(() => {
    let on = true;
    void fetchTripPlaces().then((list) => {
      if (!on) return;
      setPlaces(list);
      setTo((cur) => (list.some((p) => p.slug === cur) ? cur : list[0]?.slug ?? ""));
    });
    return () => {
      on = false;
    };
  }, []);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
    return isoOf(d);
  });
  const [nights, setNights] = useState(2);
  const [people, setPeople] = useState(2);
  const [comfort, setComfort] = useState<TripComfort>("mid");
  const [travel, setTravel] = useState<TripTravel>("any");

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
            {places.map((p) => (
              <View key={p.slug} style={{ borderRadius: 28, borderWidth: 3, borderColor: p.slug === to ? look.primary : "transparent", padding: 2 }}>
                <PlaceTile
                  p={p}
                  width={150}
                  height={170}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setTo(p.slug);
                  }}
                />
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
        {pro === false ? (
          <Body size={13} tone="secondary" style={{ textAlign: "center", marginBottom: 8 }}>
            One trip a month is free. Pro plans as many as you like, and changes them.
          </Body>
        ) : null}
        <LookButton
          label={to ? `Build my trip to ${places.find((p) => p.slug === to)?.name ?? "there"}` : "Build my trip"}
          disabled={!to}
          onPress={() => router.replace(`/trip/plan?to=${to}&arrive=${date}&nights=${nights}&people=${people}&comfort=${comfort}&travel=${travel}`)}
        />
      </View>
    </LookScreen>
  );
}
