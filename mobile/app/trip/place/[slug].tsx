import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import type { SymbolViewProps } from "expo-symbols";
import { Symbol } from "../../../src/components/Symbol";
import { GUTTER } from "../../../src/theme";
import { useLook } from "../../../src/lib/appearance";
import { fetchTripPlaces, type TripPlace, type TripPlaceRoute } from "../../../src/lib/api";
import { Body, Display, LookButton, LookScreen, RoundButton } from "../../../src/components/look";

const ICON: Record<TripPlaceRoute["mode"], SymbolViewProps["name"]> = {
  bus: "bus.fill",
  trotro: "bus",
  car: "car.fill",
  flight: "airplane",
  ferry: "ferry.fill",
};
const ORDER: TripPlaceRoute["mode"][] = ["bus", "trotro", "car", "flight", "ferry"];

/** "GHS 150", "GHS 80 to 120", "from GHS 999", or null when nobody knows it. */
function fareText(r: TripPlaceRoute): string | null {
  const f = (n: number) => `GHS ${Math.round(n).toLocaleString()}`;
  if (r.fareMin == null && r.fareMax == null) return null;
  if (r.fareMax == null) return `from ${f(r.fareMin!)}`;
  if (r.fareMin == null || r.fareMin === r.fareMax) return f(r.fareMax);
  return `${f(r.fareMin)} to ${Math.round(r.fareMax).toLocaleString()}`;
}

/** "8 Apr 2026" */
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * A destination as the research has it (0101): the photo with its credit,
 * what people go there for, and every way there we know, with the fare where
 * somebody has read it and the date they did. Plan a trip here opens the
 * trip questionnaire with it chosen.
 */
export default function TripPlaceScreen() {
  const look = useLook();
  const c = look.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [place, setPlace] = useState<TripPlace | null | undefined>(undefined);

  useEffect(() => {
    let on = true;
    void fetchTripPlaces().then((list) => on && setPlace(list.find((p) => p.slug === slug) ?? null));
    return () => {
      on = false;
    };
  }, [slug]);

  if (place === undefined) return <LookScreen band="none">{null}</LookScreen>;
  if (place === null) {
    return (
      <LookScreen band="none">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, padding: GUTTER, paddingTop: insets.top + 12, gap: 16 }}>
          <RoundButton label="Close" onPress={() => router.back()} filled>
            <Symbol name="xmark" size={16} weight="bold" color={look.onPrimary} />
          </RoundButton>
          <Body size={16}>That place is not in Trips any more.</Body>
        </View>
      </LookScreen>
    );
  }

  // Trips start from Accra for now, so a Tamale–Kumasi bus is no use on Kumasi's page; all of them only if none is from Accra.
  const fromAccra = place.routes.filter((r) => r.from === "Accra" || (r.bothWays && r.to === "Accra"));
  const routes = [...(fromAccra.length ? fromAccra : place.routes)].sort(
    (a, b) => ORDER.indexOf(a.mode) - ORDER.indexOf(b.mode) || (a.fareMin ?? 1e9) - (b.fareMin ?? 1e9)
  );
  const heroH = Math.round(width * 0.95);

  const routeCard = (r: TripPlaceRoute) => {
    const fare = fareText(r);
    // A route entered from here the other way round reads the right way for this trip.
    const [from, to] = r.to === place.gatewayTown || r.to === place.town ? [r.from, r.to] : [r.to, r.from];
    return (
      <View key={r.id} style={{ flexDirection: "row", gap: 14, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: look.tileEdge, backgroundColor: look.tile }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: look.colors.background, alignItems: "center", justifyContent: "center" }}>
          <Symbol name={ICON[r.mode]} size={19} color={c.text} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Display size={17} weight="700" style={{ flex: 1 }}>
              {r.service ? `${r.operator} · ${r.service}` : r.operator}
            </Display>
            {fare ? (
              <Body size={14} weight="700" color={c.accent}>
                {fare}
              </Body>
            ) : null}
          </View>
          <Body size={13} tone="secondary">
            {[`${from} to ${to}`, r.departures, r.fromStation ? `from ${r.fromStation}` : null].filter(Boolean).join(" · ")}
          </Body>
          <Body size={12} tone="tertiary">
            {fare ? (r.checkedOn ? `Fare as of ${shortDate(r.checkedOn)}${r.mode === "flight" ? "; changes by date" : ""}` : "Fare not checked yet") : "Fare not published: ask when you book"}
          </Body>
          {r.bookUrl || r.bookPhone ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {r.bookUrl ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(r.bookUrl!)}
                  style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: look.tileEdge, justifyContent: "center" }}
                >
                  <Body size={13} weight="700">
                    Book online
                  </Body>
                </Pressable>
              ) : null}
              {r.bookPhone ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void Linking.openURL(`tel:${r.bookPhone!.replace(/\s/g, "")}`)}
                  style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: look.tileEdge, justifyContent: "center" }}
                >
                  <Body size={13} weight="700">
                    Call
                  </Body>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <LookScreen band="none">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: heroH, backgroundColor: "#2A2620" }}>
          {place.image ? <Image source={place.image} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={250} /> : null}
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]}
            locations={[0, 0.3, 1]}
            style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: GUTTER, paddingBottom: 18, justifyContent: "space-between" }}
          >
            <RoundButton label="Close" onPress={() => router.back()} filled>
              <Symbol name="xmark" size={16} weight="bold" color={look.onPrimary} />
            </RoundButton>
            <View style={{ gap: 4 }}>
              <Body size={14} weight="700" color="rgba(255,255,255,0.9)">
                {place.roadKmFromAccra ? `${place.region} · about ${place.roadKmFromAccra} km from Accra by road` : place.region}
              </Body>
              <Display size={40} weight="800" color="#FFFFFF">
                {place.name}
              </Display>
              {place.imageCredit ? (
                <Body size={10} color="rgba(255,255,255,0.7)" numberOfLines={1}>
                  {place.imageCredit}
                </Body>
              ) : null}
            </View>
          </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: GUTTER, paddingTop: 20, gap: 28 }}>
          {place.blurb ? (
            <Body size={17} weight="500">
              {place.blurb}
            </Body>
          ) : null}

          {place.highlights.length ? (
            <View style={{ gap: 12 }}>
              <Display size={22} weight="700">
                What people go for
              </Display>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {place.highlights.map((h) => (
                  <View key={h} style={{ paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: look.tileEdge, justifyContent: "center" }}>
                    <Body size={14} weight="600">
                      {h}
                    </Body>
                  </View>
                ))}
              </View>
              {place.bestTime ? (
                <Body size={14} tone="secondary">
                  {`Best time: ${place.bestTime}`}
                </Body>
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: 12 }}>
            <Display size={22} weight="700">
              Getting there
            </Display>
            {routes.length ? (
              <Body size={14} tone="secondary">
                {place.gatewayTown === (place.town ?? place.name)
                  ? `Every way from ${fromAccra.length ? "Accra " : ""}to ${place.gatewayTown} we know of.`
                  : `Through ${place.gatewayTown}.${place.lastLeg ? ` ${place.lastLeg}.` : ""}`}
              </Body>
            ) : (
              <Body size={14} tone="secondary">
                {`We don't have ways to ${place.gatewayTown} yet.${place.lastLeg ? ` From there: ${place.lastLeg.charAt(0).toLowerCase()}${place.lastLeg.slice(1)}.` : ""}`}
              </Body>
            )}
            {routes.map(routeCard)}
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: GUTTER,
          paddingTop: 12,
          paddingBottom: insets.bottom + 10,
          backgroundColor: c.background,
          borderTopWidth: 1,
          borderTopColor: look.tileEdge,
        }}
      >
        <LookButton
          label="Plan a trip here"
          onPress={() => {
            void Haptics.selectionAsync();
            router.push(`/trip/new?to=${place.slug}`);
          }}
        />
      </View>
    </LookScreen>
  );
}
