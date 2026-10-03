import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { Button } from "../Button";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { uberRideLink, yangoRideLink } from "../../lib/format";
import { planTrip, type TripOption } from "../../lib/api";
import { currentPlace, locationAvailable, type Here } from "../../lib/location";
import type { ItineraryStop } from "../../lib/types";
import { NativeSheet } from "../native/NativeSheet";

type Origin =
  | { kind: "previous"; stop: ItineraryStop }
  | { kind: "here"; at: Here }
  | { kind: "none" };

const fare = (min: number | null, max: number | null) =>
  min == null && max == null ? null : min === max || max == null ? `GHS ${min}` : `GHS ${min ?? max} to ${max}`;

/**
 * How to reach one stop: on foot, by trotro, by taxi where trotros do not go,
 * or in a ride app.
 *
 * From the stop before when there is one, because that is where they will
 * be; from where the phone is when they ask, which is the only moment this
 * asks for location, and only while the app is open. Without either, the ride
 * apps still work: Uber finds the pickup itself.
 *
 * Trotro legs come from the 2019 route map until somebody has checked them,
 * and say so on the card. Times are estimates; fares show only where checked.
 */
export function GettingThereSheet({
  visible,
  onClose,
  stop,
  previous,
}: {
  visible: boolean;
  onClose: () => void;
  stop: ItineraryStop;
  previous: ItineraryStop | null;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [origin, setOrigin] = useState<Origin>(previous ? { kind: "previous", stop: previous } : { kind: "none" });
  const [options, setOptions] = useState<TripOption[] | null>(null);
  const [landmark, setLandmark] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setOrigin(previous ? { kind: "previous", stop: previous } : { kind: "none" });
  }, [visible, previous]);

  useEffect(() => {
    if (!visible || origin.kind === "none") return;
    let active = true;
    setBusy(true);
    setNote(null);
    const from =
      origin.kind === "here"
        ? { lat: origin.at.lat, lng: origin.at.lng, label: "Where you are" }
        : { venueId: origin.stop.venue_id };
    void planTrip(from, stop.venue_id).then((r) => {
      if (!active) return;
      setBusy(false);
      if ("error" in r) {
        setOptions(null);
        setNote(r.error);
      } else {
        setOptions(r.options);
        setLandmark(r.landmark);
      }
    });
    return () => {
      active = false;
    };
  }, [visible, origin, stop.venue_id]);

  async function useHere() {
    setBusy(true);
    const at = await currentPlace();
    setBusy(false);
    if (at === "denied") return setNote("Location is off for Duro. You can turn it on in Settings, or use a ride app below.");
    if (at === "unavailable") return setNote("We could not find your location just now.");
    setOrigin({ kind: "here", at });
  }

  const start =
    origin.kind === "here"
      ? origin.at
      : origin.kind === "previous" && origin.stop.lat != null && origin.stop.lng != null
        ? { lat: origin.stop.lat, lng: origin.stop.lng }
        : null;
  const end = stop.lat != null && stop.lng != null ? { lat: stop.lat, lng: stop.lng } : null;

  return (
    <NativeSheet visible={visible} onClose={onClose} detents={["medium", "large"]}>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: GUTTER,
            paddingVertical: space.md,
            borderBottomWidth: HAIRLINE,
            borderBottomColor: c.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="headline">Getting there</Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {stop.name}
            </Text>
          </View>
          <Button title="Done" kind="plain" size="medium" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={{ padding: GUTTER, paddingBottom: insets.bottom + space.xxl, gap: space.md }}>
          {landmark ? (
            <View style={{ padding: space.lg, borderRadius: radius.card, backgroundColor: c.backgroundElement }}>
              <Text variant="eyebrow" tone="secondary" uppercase>
                Tell the driver
              </Text>
              <Text variant="title3" style={{ marginTop: space.xs }}>
                {landmark}
              </Text>
            </View>
          ) : null}

          {/* Ride apps first: the answer most visitors want, and it needs nothing from us. */}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <RideButton label="Uber" dark onPress={() => void Linking.openURL(uberRideLink(stop))} />
            {start && end ? (
              <RideButton label="Yango" onPress={() => void Linking.openURL(yangoRideLink(start, end))} />
            ) : null}
          </View>

          <Text variant="title3" style={{ marginTop: space.md }}>
            By trotro
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {previous ? (
              <OriginChip
                label={`From ${previous.name}`}
                on={origin.kind === "previous"}
                onPress={() => setOrigin({ kind: "previous", stop: previous })}
              />
            ) : null}
            {locationAvailable() ? (
              <OriginChip label="From where I am" icon="location.fill" on={origin.kind === "here"} onPress={() => void useHere()} />
            ) : null}
          </View>
          {!previous && !locationAvailable() ? (
            <Text variant="footnote" tone="secondary">
              Trotro directions from where you are need the latest version of Duro from the App Store.
            </Text>
          ) : null}

          {busy ? <ActivityIndicator color={c.accent} /> : null}
          {note ? (
            <Text variant="footnote" tone="secondary">
              {note}
            </Text>
          ) : null}

          {!busy && options
            ? options.map((o, i) => <OptionCard key={i} option={o} />)
            : null}

          <Text variant="caption" tone="tertiary" style={{ marginTop: space.md }}>
            Trotro routes from the 2019 Accra route map by OpenStreetMap Ghana and Digital Transport for Africa. Map data
            © OpenStreetMap contributors, under the Open Database Licence. Times are estimates; ask the mate before you
            board.
          </Text>
        </ScrollView>
      </View>
    </NativeSheet>
  );
}

/** A ride app's own colours, half the width of a row, so two sit side by side. Shared with Where next. */
export function RideButton({ label, onPress, dark }: { label: string; onPress: () => void; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Continue in ${label}`}
      style={({ pressed }) => ({
        flex: 1,
        height: 48,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: dark ? "#000000" : "#FFD500",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="headline" style={{ color: dark ? "#FFFFFF" : "#000000" }}>
        Continue in {label}
      </Text>
    </Pressable>
  );
}

function OriginChip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: "location.fill" }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        backgroundColor: on ? c.accent : c.backgroundElement,
      }}
    >
      {icon ? <Symbol name={icon} size={12} color={on ? c.textOnBrand : c.accent} /> : null}
      <Text variant="footnote" weight="600" tone={on ? "onTint" : "label"} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function OptionCard({ option }: { option: TripOption }) {
  const c = useTheme();
  const rides = option.steps.filter((s) => s.kind === "ride").length;
  const title =
    option.kind === "walk"
      ? "Walk it"
      : option.kind === "taxi"
        ? "Taxi the whole way"
        : option.kind === "trotro+taxi"
          ? "Trotro, then a taxi"
          : rides > 1
            ? "Two trotros"
            : "One trotro";
  const trotroFare = fare(option.trotroFareMin, option.trotroFareMax);
  const cost = [
    option.kind === "trotro" || option.kind === "trotro+taxi" ? (trotroFare ? `trotro ${trotroFare}` : "trotro fare not checked") : null,
    option.taxiGhs ? `taxi about GHS ${option.taxiGhs}` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <View
      style={{
        padding: space.lg,
        borderRadius: radius.card,
        backgroundColor: c.backgroundElement,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text variant="headline">{title}</Text>
        <Text variant="footnote" tone="secondary" tabular>
          about {option.minutes} min
        </Text>
      </View>
      {cost ? (
        <Text variant="footnote" tone="secondary">
          {cost}
        </Text>
      ) : null}
      {option.unchecked ? (
        <Text variant="caption" tone="tint">
          From the 2019 route map, not checked by us yet.
        </Text>
      ) : null}
      {option.steps.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space.sm, marginTop: 2 }}>
          <Text variant="callout">{s.kind === "walk" ? "🚶" : s.kind === "taxi" ? "🚕" : "🚐"}</Text>
          <Text variant="callout" style={{ flex: 1 }}>
            {s.kind === "walk"
              ? `Walk about ${s.minutes} min to ${s.toLabel}.`
              : s.kind === "taxi"
                ? `Taxi from ${s.fromLabel} to ${s.toLabel}, about GHS ${s.costGhs}. ${
                    s.reason === "the whole way" ? "" : "Trotros do not go this stretch."
                  }`
                : `At ${s.board.label}, take the ${s.line.name} trotro${
                    s.line.headsign ? ` towards ${s.line.headsign}` : ""
                  }${s.line.calledAs ? `; the mate calls “${s.line.calledAs}”` : ""}. Get off at ${s.alight.label}${
                    s.stopsBetween > 0 ? `, ${s.stopsBetween} stops on` : ""
                  }.`}
          </Text>
        </View>
      ))}
    </View>
  );
}
