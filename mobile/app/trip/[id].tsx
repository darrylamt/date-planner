import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER } from "../../src/theme";
import { useLook } from "../../src/lib/appearance";
import { longDate } from "../../src/lib/format";
import { DESTINATIONS, MODE_ICON, tripTotal, type TripRoute } from "../../src/lib/tripMock";
import { stopColours } from "../../src/components/redesign/stopColours";
import { SampleBadge } from "../../src/components/redesign/TripsHome";
import { Body, Display, LookButton, LookScreen, RoundButton } from "../../src/components/look";

const ghs = (n: number) => `GHS ${Math.round(n).toLocaleString()}`;
const hoursText = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : Number.isInteger(h) ? `${h} hr` : `${Math.floor(h)} hr ${Math.round((h % 1) * 60)} min`);

/**
 * A trip, as it will look once built (preview on sample data, 3 Nov 2026):
 * getting there, where you'll stay, each day planned, getting back, and
 * what it comes to. The way there and the stay can be changed by tapping.
 */
export default function Trip() {
  const look = useLook();
  const c = look.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; nights?: string; people?: string; date?: string; travel?: string }>();
  const d = DESTINATIONS.find((x) => x.id === params.id) ?? DESTINATIONS[0];
  const nights = Math.max(1, Number(params.nights) || 2);
  const people = Math.max(1, Number(params.people) || 2);
  const start = params.date ?? new Date().toISOString().slice(0, 10);
  const preferred = d.routes.findIndex((r) => r.mode === params.travel);
  const [routeAt, setRouteAt] = useState(preferred >= 0 ? preferred : 0);
  const [stayAt, setStayAt] = useState(0);
  const total = useMemo(() => tripTotal(d, people, nights, routeAt, stayAt), [d, people, nights, routeAt, stayAt]);
  const colours = stopColours(look);
  const dayDate = (i: number) => {
    const x = new Date(`${start}T12:00:00`);
    x.setDate(x.getDate() + i);
    return longDate(x.toISOString().slice(0, 10));
  };

  const routeCard = (r: TripRoute, i: number, back = false) => {
    const on = i === routeAt;
    const price = r.perDay ? `${ghs(r.fare)} a day` : `${ghs(r.fare)} each`;
    return (
      <Pressable
        key={`${back ? "b" : "t"}${i}`}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        disabled={back}
        onPress={() => {
          void Haptics.selectionAsync();
          setRouteAt(i);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          padding: 16,
          borderRadius: 22,
          borderWidth: on ? 2 : 1,
          borderColor: on ? look.primary : look.tileEdge,
          backgroundColor: on ? look.tile : "transparent",
        }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: on ? look.primary : look.tile, alignItems: "center", justifyContent: "center" }}>
          <Symbol name={MODE_ICON[r.mode]} size={20} color={on ? look.onPrimary : c.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Display size={17} weight="700">
            {r.operator}
          </Display>
          <Body size={13} tone="secondary">
            {back ? `${hoursText(r.hours)} home` : `${r.from} · ${r.departs} · ${hoursText(r.hours)}`}
          </Body>
          {r.note && !back ? (
            <Body size={12} tone="tertiary">
              {r.note}
            </Body>
          ) : null}
        </View>
        <Body size={14} weight="700" color={c.accent}>
          {price}
        </Body>
      </Pressable>
    );
  };

  return (
    <LookScreen band="none">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={d.tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 300 + insets.top, paddingTop: insets.top + 8, paddingHorizontal: GUTTER, justifyContent: "space-between", paddingBottom: 22 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <RoundButton label="Close" onPress={() => router.back()} filled>
              <Symbol name="xmark" size={16} weight="bold" color={look.onPrimary} />
            </RoundButton>
            <Symbol name={d.icon} size={34} color="rgba(255,255,255,0.9)" />
          </View>
          <View style={{ gap: 6 }}>
            <Body size={14} weight="700" color="rgba(255,255,255,0.9)">
              {`${d.region} · ${nights} ${nights === 1 ? "night" : "nights"} · ${people === 1 ? "just you" : `${people} of you`}`}
            </Body>
            <Display size={44} weight="800" color="#FFFFFF">
              {d.name}
            </Display>
            <Body size={15} color="rgba(255,255,255,0.9)">
              {d.blurb}
            </Body>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: GUTTER, paddingTop: 18, gap: 30 }}>
          <SampleBadge />

          <View style={{ gap: 12 }}>
            <Display size={22} weight="700">
              Getting there
            </Display>
            <Body size={14} tone="secondary">
              {longDate(start)}. Tap to choose.
            </Body>
            {d.routes.map((r, i) => routeCard(r, i))}
          </View>

          <View style={{ gap: 12 }}>
            <Display size={22} weight="700">
              Where you'll stay
            </Display>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: GUTTER }} style={{ marginRight: -GUTTER }}>
              {d.stays.map((s, i) => {
                const on = i === stayAt;
                const rooms = Math.ceil(people / s.sleeps);
                return (
                  <Pressable
                    key={s.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setStayAt(i);
                    }}
                    style={{ width: width * 0.68, borderRadius: 26, overflow: "hidden", borderWidth: on ? 2 : 1, borderColor: on ? look.primary : look.tileEdge, backgroundColor: look.tile }}
                  >
                    <LinearGradient colors={s.tint} style={{ height: 130, padding: 14, justifyContent: "flex-end" }}>
                      <Body size={12} weight="700" color="rgba(255,255,255,0.9)">
                        {`${s.kind} · ${s.area}`}
                      </Body>
                    </LinearGradient>
                    <View style={{ padding: 14, gap: 4 }}>
                      <Display size={18} weight="700">
                        {s.name}
                      </Display>
                      <Body size={13} tone="secondary">
                        {`${s.room}, sleeps ${s.sleeps}${s.breakfast ? " · breakfast in" : ""}`}
                      </Body>
                      <Body size={14} weight="700" color={c.accent}>
                        {`${ghs(s.nightly)} a night${rooms > 1 ? ` · ${rooms} rooms` : ""}`}
                      </Body>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <LookButton
              label="Request to book"
              kind="outline"
              onPress={() =>
                Alert.alert("This is a preview", `With Trips built, this sends ${d.stays[stayAt].name} your dates and party, and the place confirms on WhatsApp.`)
              }
            />
          </View>

          <View style={{ gap: 14 }}>
            <Display size={22} weight="700">
              Day by day
            </Display>
            {d.days.slice(0, nights + 1).map((day, i) => (
              <View key={day.title} style={{ borderRadius: 24, borderWidth: 1, borderColor: look.tileEdge, padding: 16, gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colours[i % colours.length].bg, alignItems: "center", justifyContent: "center" }}>
                    <Display size={16} weight="800" color={colours[i % colours.length].fg}>
                      {String(i + 1)}
                    </Display>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Display size={18} weight="700">
                      {day.title}
                    </Display>
                    <Body size={13} tone="secondary">
                      {dayDate(i)}
                    </Body>
                  </View>
                </View>
                {day.stops.map((s) => (
                  <View key={s.name} style={{ flexDirection: "row", gap: 12 }}>
                    <Body size={13} weight="700" style={{ width: 66 }}>
                      {s.time}
                    </Body>
                    <View style={{ flex: 1 }}>
                      <Body size={15} weight="600">
                        {s.name}
                      </Body>
                      <Body size={13} tone="secondary">
                        {s.what}
                      </Body>
                    </View>
                    {s.cost ? (
                      <Body size={13} weight="600" color={c.accent}>
                        {ghs((s.cost * people) / 2)}
                      </Body>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>

          <View style={{ gap: 12 }}>
            <Display size={22} weight="700">
              Getting back
            </Display>
            {d.routes[routeAt] ? routeCard(d.routes[routeAt], routeAt, true) : null}
          </View>
        </View>
      </ScrollView>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: insets.bottom + 10, backgroundColor: c.background, borderTopWidth: 1, borderTopColor: look.tileEdge, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Body size={12} weight="600" tone="secondary">{`The whole trip, ${people === 1 ? "for you" : `for ${people}`}`}</Body>
          <Display size={26} weight="800">
            {ghs(total)}
          </Display>
        </View>
        <LookButton label="Save trip" onPress={() => Alert.alert("This is a preview", "Saved trips arrive with Trips. Nothing here is booked or charged.")} style={{ paddingHorizontal: 24 }} />
      </View>
    </LookScreen>
  );
}
