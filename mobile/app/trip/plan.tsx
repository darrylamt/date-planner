import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import type { SymbolViewProps } from "expo-symbols";
import { Symbol } from "../../src/components/Symbol";
import { GUTTER } from "../../src/theme";
import { useLook } from "../../src/lib/appearance";
import { longDate } from "../../src/lib/format";
import {
  fetchTripPlaces,
  generateTrip,
  type Trip,
  type TripComfort,
  type TripRange,
  type TripStay,
  type TripTravel,
  type TripWay,
} from "../../src/lib/api";
import { BuildSteps, PlanLoader } from "../../src/components/redesign/PlanLoader";
import { ProSheet } from "../../src/components/profile/ProSheet";
import { stopColours } from "../../src/components/redesign/stopColours";
import { Body, Display, KenteBand, LookBackground, LookButton, LookScreen, RoundButton } from "../../src/components/look";

const ICON: Record<TripWay["mode"], SymbolViewProps["name"]> = {
  bus: "bus.fill",
  trotro: "bus",
  car: "car.fill",
  flight: "airplane",
  ferry: "ferry.fill",
};

const ghs = (n: number) => `GHS ${Math.round(n).toLocaleString()}`;
/** "GHS 240", "GHS 1,998+" for a "from" figure, "GHS 240 to 300". */
const rangeText = (r: TripRange) => (r.max == null ? `${ghs(r.min)}+` : r.max === r.min ? ghs(r.min) : `${ghs(r.min)} to ${Math.round(r.max).toLocaleString()}`);
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
/** A Ghanaian mobile as wa.me wants it: 024… becomes 23324…. */
const waNumber = (n: string) => {
  const d = n.replace(/\D/g, "");
  return d.startsWith("0") ? `233${d.slice(1)}` : d;
};

/**
 * A whole trip, planned by the server (src/lib/trip.ts on the website): the
 * ways there, where to stay, each day in parts, sights, the way back and the
 * total. What it could not do comes first, in its own words, so a trip to
 * somewhere we are still filling in is honest about it; every fare and price
 * shown is on record with its date.
 */
export default function TripPlan() {
  const look = useLook();
  const c = look.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ to: string; arrive: string; nights: string; people: string; comfort: string; travel: string }>();
  const inputs = useMemo(
    () => ({
      to: params.to,
      arrive: params.arrive,
      nights: Math.max(1, Number(params.nights) || 2),
      partySize: Math.max(1, Number(params.people) || 2),
      comfort: (["easy", "mid", "treat"].includes(params.comfort) ? params.comfort : "mid") as TripComfort,
      travel: (params.travel || "any") as TripTravel,
    }),
    [params.to, params.arrive, params.nights, params.people, params.comfort, params.travel]
  );
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The free trip this month is used: what to say, and the Pro sheet.
  const [limit, setLimit] = useState<string | null>(null);
  const [proSheet, setProSheet] = useState(false);
  const [placeName, setPlaceName] = useState<{ name: string; gateway: string } | null>(null);
  const [wayId, setWayId] = useState<string | null>(null);
  const [stayAt, setStayAt] = useState(0);
  const colours = stopColours(look);

  const build = useCallback(() => {
    setError(null);
    setLimit(null);
    setTrip(null);
    void generateTrip(inputs).then((res) => {
      if (res.status === "ok") {
        setTrip(res.trip);
        setWayId(res.trip.chosenWay);
        setStayAt(0);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (res.status === "limit") setLimit(res.message);
      else setError(res.message);
    });
  }, [inputs]);

  useEffect(() => {
    build();
    void fetchTripPlaces().then((list) => {
      const p = list.find((x) => x.slug === inputs.to);
      if (p) setPlaceName({ name: p.name, gateway: p.gatewayTown });
    });
  }, [build, inputs.to]);

  // ── building ──────────────────────────────────────────────────────────
  if (!trip) {
    const name = placeName?.name ?? "there";
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ headerShown: false }} />
        <LookBackground />
        <KenteBand />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 40, gap: 26 }}>
          {limit ? (
            <>
              <Display size={32} weight="700">
                More trips with Pro
              </Display>
              <Body size={16} tone="secondary">
                {limit}
              </Body>
              <LookButton label="See Pro" onPress={() => setProSheet(true)} />
              <LookButton label="Back" kind="outline" onPress={() => router.back()} />
              <ProSheet visible={proSheet} onClose={() => setProSheet(false)} tier="free" onPurchased={() => (setProSheet(false), build())} />
            </>
          ) : error ? (
            <>
              <Display size={32} weight="700">
                That didn&apos;t work
              </Display>
              <Body size={16} tone="secondary">
                {error}
              </Body>
              <LookButton label="Try again" onPress={build} />
              <LookButton label="Back" kind="outline" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <View style={{ alignSelf: "center" }}>
                <PlanLoader size={176} />
              </View>
              <Display size={36} weight="700">
                Putting your trip together
              </Display>
              <BuildSteps
                stepMs={1400}
                steps={[
                  `Finding ways from Accra to ${placeName?.gateway ?? name}`,
                  `Looking for places to stay in ${name}`,
                  "Planning each day",
                  "Adding it all up",
                ]}
              />
            </>
          )}
        </View>
      </View>
    );
  }

  // ── the trip ──────────────────────────────────────────────────────────
  const d = trip.destination;
  const people = trip.inputs.partySize;
  const way = trip.ways.find((w) => w.id === wayId) ?? null;
  const stay: TripStay | null = trip.stays[stayAt] ?? null;
  const travel = way ? (way.return ?? way.oneWay) : null;
  const sum = (stay?.total ?? 0) + trip.totals.days;
  const total: TripRange = travel ? { min: sum + travel.min, max: travel.max == null ? null : sum + travel.max } : { min: sum, max: sum };
  const complete = Boolean(way?.return) && stay?.total != null && trip.days.every((x) => x.parts.every((p) => p.itinerary));
  const heroH = Math.round(width * 0.9);
  const forParty = people === 1 ? "for you" : `for ${people}`;

  const section = (title: string, children: React.ReactNode, sub?: string) => (
    <View style={{ gap: 12 }}>
      <Display size={22} weight="700">
        {title}
      </Display>
      {sub ? (
        <Body size={14} tone="secondary">
          {sub}
        </Body>
      ) : null}
      {children}
    </View>
  );

  const pill = (label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: look.tileEdge, justifyContent: "center" }}
    >
      <Body size={13} weight="700">
        {label}
      </Body>
    </Pressable>
  );

  const wayCard = (w: TripWay, back = false) => {
    const on = !back && w.id === wayId;
    const fare = w.oneWay ? `${rangeText(w.oneWay)} ${w.perVehicle ? "a car" : forParty}, one way` : "Fare not published: ask when you book";
    return (
      <Pressable
        key={`${back ? "b" : "t"}${w.id}`}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        disabled={back}
        onPress={() => {
          void Haptics.selectionAsync();
          setWayId(w.id);
        }}
        style={{ flexDirection: "row", gap: 14, padding: 16, borderRadius: 22, borderWidth: on ? 2 : 1, borderColor: on ? look.primary : look.tileEdge, backgroundColor: on ? look.tile : "transparent" }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? look.primary : look.tile, alignItems: "center", justifyContent: "center" }}>
          <Symbol name={ICON[w.mode]} size={19} color={on ? look.onPrimary : c.text} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Display size={17} weight="700">
            {w.service ? `${w.operator} · ${w.service}` : w.operator}
          </Display>
          <Body size={13} tone="secondary">
            {[back ? `${w.to} to ${w.from}` : `${w.from} to ${w.to}`, w.departures, !back && w.fromStation ? `from ${w.fromStation}` : null].filter(Boolean).join(" · ")}
          </Body>
          <Body size={14} weight="700" color={w.oneWay ? c.accent : c.textSecondary}>
            {back ? (w.return ? `${rangeText({ min: w.return.min / 2, max: w.return.max == null ? null : w.return.max / 2 })} ${forParty}` : "Fare back not on record") : fare}
          </Body>
          {!back && w.checkedOn ? (
            <Body size={12} tone="tertiary">
              {`Fare as of ${shortDate(w.checkedOn)}${w.mode === "flight" ? "; flights change by date" : ""}`}
            </Body>
          ) : null}
          {!back && (w.bookUrl || w.bookPhone) ? (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {w.bookUrl ? pill("Book online", () => void Linking.openURL(w.bookUrl!)) : null}
              {w.bookPhone ? pill("Call", () => void Linking.openURL(`tel:${w.bookPhone!.replace(/\s/g, "")}`)) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const askToBook = (s: Pick<TripStay, "name" | "whatsapp" | "phone" | "bookingUrl">, rates: boolean) => {
    const msg = encodeURIComponent(
      rates
        ? `Hello ${s.name}, I found you on Duro! I'd like to stay ${trip.inputs.nights === 1 ? "one night" : `${trip.inputs.nights} nights`} from ${longDate(trip.inputs.arrive)}, ${people === 1 ? "just me" : `${people} of us`}. Is there a room, and what does it cost?`
        : `Hello ${s.name}, I found you on Duro! What are your room rates for ${people === 1 ? "one person" : `${people} people`} from ${longDate(trip.inputs.arrive)}, ${trip.inputs.nights === 1 ? "one night" : `${trip.inputs.nights} nights`}?`
    );
    return [
      s.whatsapp ? pill(rates ? "Ask to book on WhatsApp" : "Ask on WhatsApp", () => void Linking.openURL(`https://wa.me/${waNumber(s.whatsapp!)}?text=${msg}`)) : null,
      s.phone ? pill("Call", () => void Linking.openURL(`tel:${s.phone!.replace(/\s/g, "")}`)) : null,
      s.bookingUrl ? pill("Their site", () => void Linking.openURL(s.bookingUrl!)) : null,
    ].filter(Boolean);
  };

  return (
    <LookScreen band="none">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: heroH, backgroundColor: "#2A2620" }}>
          {d.image ? <Image source={d.image} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={250} /> : null}
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]}
            locations={[0, 0.3, 1]}
            style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: GUTTER, paddingBottom: 18, justifyContent: "space-between" }}
          >
            <RoundButton label="Close" onPress={() => router.back()} filled>
              <Symbol name="xmark" size={16} weight="bold" color={look.onPrimary} />
            </RoundButton>
            <View style={{ gap: 4 }}>
              <Body size={14} weight="700" color="rgba(255,255,255,0.9)">
                {`${shortDate(trip.inputs.arrive)} to ${shortDate(trip.leave)} · ${people === 1 ? "just you" : `${people} of you`}`}
              </Body>
              <Display size={42} weight="800" color="#FFFFFF">
                {d.name}
              </Display>
              {d.imageCredit ? (
                <Body size={10} color="rgba(255,255,255,0.7)" numberOfLines={1}>
                  {d.imageCredit}
                </Body>
              ) : null}
            </View>
          </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: GUTTER, paddingTop: 20, gap: 30 }}>
          {trip.gaps.length ? (
            <View style={{ padding: 16, borderRadius: 22, borderWidth: 1, borderStyle: "dashed", borderColor: c.accent, gap: 8 }}>
              <Display size={17} weight="700">
                {trip.ready ? "Good to know" : "What we don't have yet"}
              </Display>
              {trip.gaps.map((g) => (
                <View key={g} style={{ flexDirection: "row", gap: 8 }}>
                  <Body size={14} color={c.accent}>
                    •
                  </Body>
                  <Body size={14} tone="secondary" style={{ flex: 1 }}>
                    {g}
                  </Body>
                </View>
              ))}
              <Body size={12} tone="tertiary">
                Everything shown is on record, with the date we read it. Nothing is guessed.
              </Body>
            </View>
          ) : null}

          {section(
            "Getting there",
            trip.ways.map((w) => wayCard(w)),
            trip.ways.length ? (d.lastLeg && d.gatewayTown !== (d.town ?? d.name) ? `To ${d.gatewayTown}, then ${d.lastLeg.charAt(0).toLowerCase()}${d.lastLeg.slice(1)}.` : "Tap one to choose.") : `We don't have a way to ${d.gatewayTown} yet.`
          )}

          {section(
            "Where you'll stay",
            <>
              {trip.stays.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: GUTTER }} style={{ marginRight: -GUTTER }}>
                  {trip.stays.map((s, i) => {
                    const on = i === stayAt;
                    return (
                      <Pressable
                        key={s.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setStayAt(i);
                        }}
                        style={{ width: width * 0.72, borderRadius: 26, overflow: "hidden", borderWidth: on ? 2 : 1, borderColor: on ? look.primary : look.tileEdge, backgroundColor: look.tile }}
                      >
                        <View style={{ height: 130, backgroundColor: "#2A2620" }}>
                          {s.image ? <Image source={s.image} style={{ flex: 1 }} contentFit="cover" /> : null}
                        </View>
                        <View style={{ padding: 14, gap: 4 }}>
                          <Display size={18} weight="700">
                            {s.name}
                          </Display>
                          <Body size={13} tone="secondary">
                            {s.room ? `${s.rooms > 1 ? `${s.rooms} × ` : ""}${s.room.name}, sleeps ${s.room.sleeps}${s.room.breakfast ? " · breakfast in" : ""}` : ""}
                          </Body>
                          {s.total != null ? (
                            <Body size={15} weight="700" color={c.accent}>
                              {`${ghs(s.total)} for ${trip.inputs.nights === 1 ? "the night" : `${trip.inputs.nights} nights`}`}
                            </Body>
                          ) : null}
                          {s.ratesCheckedOn ? (
                            <Body size={12} tone="tertiary">
                              {`Rates as of ${shortDate(s.ratesCheckedOn)}`}
                            </Body>
                          ) : null}
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>{askToBook(s, true)}</View>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Body size={15} tone="secondary">
                  {trip.askForRates.length ? "These haven't given us their rates yet. Ask them directly:" : `We don't have places to stay in ${d.name} yet. We're adding them.`}
                </Body>
              )}
              {trip.askForRates.map((s) => (
                <View key={s.id} style={{ padding: 14, borderRadius: 20, borderWidth: 1, borderColor: look.tileEdge, gap: 8 }}>
                  <Body size={15} weight="700">
                    {s.name}
                  </Body>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{askToBook(s, false)}</View>
                </View>
              ))}
            </>
          )}

          {section(
            "Day by day",
            trip.days.map((day, i) => (
              <View key={day.date} style={{ borderRadius: 24, borderWidth: 1, borderColor: look.tileEdge, padding: 16, gap: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colours[i % colours.length].bg, alignItems: "center", justifyContent: "center" }}>
                    <Display size={16} weight="800" color={colours[i % colours.length].fg}>
                      {String(i + 1)}
                    </Display>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Display size={18} weight="700">
                      {day.label}
                    </Display>
                    <Body size={13} tone="secondary">
                      {longDate(day.date)}
                    </Body>
                  </View>
                </View>
                {day.parts.map((part) => (
                  <View key={part.label} style={{ gap: 10 }}>
                    <Body size={12} weight="700" tone="tertiary">
                      {part.label.toUpperCase()}
                    </Body>
                    {part.itinerary ? (
                      part.itinerary.stops.map((s) => (
                        <Pressable
                          key={s.venue_id}
                          accessibilityRole="button"
                          onPress={() => router.push(`/venue/${s.venue_id}`)}
                          style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
                        >
                          <Body size={13} weight="700" style={{ width: 66 }}>
                            {s.arrival_time}
                          </Body>
                          <View style={{ flex: 1 }}>
                            <Body size={15} weight="600">
                              {s.name}
                            </Body>
                            <Body size={13} tone="secondary" numberOfLines={2}>
                              {s.label ? `${s.label.charAt(0)}${s.label.slice(1).toLowerCase()}` : s.area}
                            </Body>
                          </View>
                          <Body size={13} weight="600" color={c.accent}>
                            {s.est_cost_ghs ? ghs(s.est_cost_ghs) : "Free"}
                          </Body>
                        </Pressable>
                      ))
                    ) : (
                      <Body size={14} tone="tertiary">
                        {part.note}
                      </Body>
                    )}
                  </View>
                ))}
              </View>
            ))
          )}

          {trip.sights.length
            ? section(
                "Worth seeing",
                trip.sights.map((s) => (
                  <View key={s.id} style={{ padding: 14, borderRadius: 20, borderWidth: 1, borderColor: look.tileEdge, gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Body size={15} weight="700" style={{ flex: 1 }}>
                        {s.name}
                      </Body>
                      <Body size={13} weight="700" color={s.fee == null ? c.textSecondary : c.accent}>
                        {s.fee == null ? "Fee not on record" : s.fee === 0 ? "Free" : `${ghs(s.fee)} each`}
                      </Body>
                    </View>
                    {s.description ? (
                      <Body size={13} tone="secondary" numberOfLines={3}>
                        {s.description}
                      </Body>
                    ) : null}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                      {pill("Details", () => router.push(`/venue/${s.id}`))}
                      {s.mapsUrl ? pill("Map", () => void Linking.openURL(s.mapsUrl!)) : null}
                    </View>
                  </View>
                ))
              )
            : null}

          {way ? section("Getting back", wayCard(way, true), `${longDate(trip.leave)}, after the last morning.`) : null}

          <LookButton label="Change the trip" kind="outline" onPress={() => router.replace(`/trip/new?to=${trip.inputs.to}`)} />
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
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Body size={12} weight="600" tone="secondary">
            {complete ? `The whole trip, ${forParty}` : `What we have prices for, ${forParty}`}
          </Body>
          <Display size={26} weight="800">
            {rangeText(total)}
          </Display>
        </View>
        {!complete ? (
          <Body size={12} tone="tertiary" style={{ maxWidth: 140, textAlign: "right" }}>
            {[!travel ? "no fare" : null, stay?.total == null ? "no stay" : null, trip.days.some((x) => x.parts.some((p) => !p.itinerary)) ? "some days open" : null].filter(Boolean).join(", ")}
          </Body>
        ) : null}
      </View>
    </LookScreen>
  );
}
