import { Fragment, useState } from "react";
import { Alert, Linking, ScrollView, Share, View } from "react-native";
import { router } from "expo-router";
import * as Calendar from "expo-calendar";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Button, ActionBar } from "../Button";
import { Symbol } from "../Symbol";
import { Toast } from "../Toast";
import { BudgetBar, Hop } from "./BudgetBar";
import { StopCard } from "./StopCard";
import { GUTTER, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs, longDate } from "../../lib/format";
import { createReservation, fetchVenueContact } from "../../lib/data";
import { planMailto } from "../../lib/planEmail";
import { swapStopLocally } from "../../lib/swapStop";
import type {
  Itinerary,
  ItineraryOrder,
  PlanInputs,
  StopAlternate,
} from "../../lib/types";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export function ItineraryView({
  inputs,
  itinerary,
  onItineraryChange,
  onEdit,
  onSave,
  shareSlug,
  saving,
}: {
  inputs: PlanInputs;
  itinerary: Itinerary;
  onItineraryChange: (it: Itinerary) => void;
  onEdit: () => void;
  /** Persists the plan and resolves to its share slug (null if not signed in). */
  onSave: () => Promise<string | null>;
  shareSlug: string | null;
  saving: boolean;
}) {
  const c = useTheme();
  const [reservingIndex, setReservingIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const over = itinerary.est_total_ghs > inputs.budget;

  /**
   * Swap a stop for its next alternate.
   *
   * Alternates are chosen by the planner at the same time as the stop itself,
   * so this is a local substitution: no request, no wait, and no chance of the
   * swap costing more than the budget allows. The old venue rotates to the
   * back of the list, so tapping repeatedly cycles the options rather than
   * running out after one.
   *
   * Transport is left alone. A different venue would shift the hop estimate,
   * but most of the catalogue has no coordinates and falls back to a flat
   * per-hop figure anyway, so recomputing here would imply a precision the
   * number does not have.
   */
  function handleSwap(index: number) {
    const result = swapStopLocally(itinerary, index, inputs.budget);
    if (!result) {
      setToast("Nothing else fits here.");
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onItineraryChange(result.itinerary);
    setToast(result.message);
  }

  /** Menu edits recompute food and overall totals locally, no round trip. */
  function handleOrdersChange(index: number, orders: ItineraryOrder[]) {
    const stopCost = Math.round(orders.reduce((sum, o) => sum + Number(o.price_ghs), 0));
    const stops = itinerary.stops.map((s, i) =>
      i === index ? { ...s, orders, est_cost_ghs: stopCost } : s
    );
    const food = Math.round(stops.reduce((sum, s) => sum + Number(s.est_cost_ghs), 0));
    const est = Math.round(food + Number(itinerary.transport_total_ghs));

    onItineraryChange({ ...itinerary, stops, food_total_ghs: food, est_total_ghs: est });

    if (est > inputs.budget) {
      setToast(`Heads up, now ${ghs(est - inputs.budget)} over budget`);
    }
  }

  /**
   * Log the request (our system of record), then hand off to the venue's
   * WhatsApp with the message pre-written.
   */
  async function handleReserve(index: number) {
    if (reservingIndex !== null) return;
    const stop = itinerary.stops[index];
    setReservingIndex(index);

    try {
      const [contact] = await Promise.all([
        fetchVenueContact(stop.venue_id),
        createReservation({
          venueId: stop.venue_id,
          venueName: stop.name,
          planSlug: shareSlug,
          partySize: 2,
          date: inputs.date,
          arrivalTime: stop.arrival_time,
          guestName: inputs.partner.name,
        }),
      ]);

      const stops = itinerary.stops.map((s, i) =>
        i === index ? { ...s, reservation_requested: true } : s
      );
      onItineraryChange({ ...itinerary, stops });

      const phone = contact?.phone?.replace(/\D/g, "");
      if (phone) {
        const msg =
          `Hello ${stop.name}! I would like to reserve a table for two on ` +
          `${longDate(inputs.date)} at ${stop.arrival_time}. ` +
          `Please confirm availability., sent via aduro`;
        await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
        setToast("Sent, they will confirm on WhatsApp.");
      } else {
        setToast("Logged, no number on file, we will follow up.");
      }
    } catch {
      setToast("Could not send that. Try again.");
    } finally {
      setReservingIndex(null);
    }
  }

  /**
   * Email the plan.
   *
   * Saving first so the mail carries a working link, but a failed save is not
   * fatal here: the body holds the whole itinerary, so an unsaved plan still
   * sends usefully, it just goes without the online version.
   */
  async function handleEmail() {
    let slug = shareSlug;
    if (!slug) {
      try {
        slug = await onSave();
      } catch {
        slug = null;
      }
    }

    const url = slug ? `${WEB_URL}/p/${slug}` : null;
    try {
      await Linking.openURL(planMailto(itinerary, inputs.date, url));
    } catch {
      setToast("No mail app is set up on this device.");
    }
  }

  async function handleShare() {
    const slug = shareSlug ?? (await onSave());
    if (!slug) return; // onSave surfaced the sign-in prompt

    const url = `${WEB_URL}/p/${slug}`;
    try {
      await Share.share({
        message: `Our plan for ${longDate(inputs.date)}, ${url}`,
        url,
      });
    } catch {
      setToast("Could not open the share sheet.");
    }
  }

  /** Writes each stop to the phone's calendar as its own timed event. */
  async function handleAddToCalendar() {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Calendar access needed",
        "Allow calendar access in Settings to add your plan."
      );
      return;
    }

    try {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      if (!defaultCal?.id) {
        setToast("No writable calendar found on this device.");
        return;
      }

      for (const stop of itinerary.stops) {
        const start = parseStopStart(inputs.date, stop.arrival_time);
        if (!start) continue;
        const end = new Date(start.getTime() + stop.duration_mins * 60_000);

        await Calendar.createEventAsync(defaultCal.id, {
          title: `${stop.label}: ${stop.name}`,
          startDate: start,
          endDate: end,
          location: `${stop.name}, ${stop.area}, Accra`,
          notes: stop.why_this_fits,
        });
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast("Added to your calendar");
    } catch {
      setToast("Could not add to your calendar.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxxl }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Title block */}
        <View style={{ paddingHorizontal: GUTTER, paddingTop: space.sm, marginBottom: space.lg }}>
          <Text variant="footnote" tone="secondary">
            {longDate(inputs.date)}
          </Text>
          <Text variant="title1" style={{ marginTop: space.xs }}>
            {itinerary.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.sm }}>
            <Symbol name="arrow.triangle.turn.up.right.diamond" size={13} color={c.textSecondary} />
            <Text variant="footnote" tone="secondary">
              {itinerary.summary_route}
            </Text>
          </View>
        </View>

        {/* Budget */}
        <View style={{ paddingHorizontal: GUTTER, marginBottom: space.lg }}>
          <BudgetBar
            estimated={itinerary.est_total_ghs}
            budget={inputs.budget}
            food={itinerary.food_total_ghs}
            transport={itinerary.transport_total_ghs}
          />
        </View>

        {itinerary.budget_note ? (
          <View
            style={{
              marginHorizontal: GUTTER,
              marginBottom: space.lg,
              padding: space.md,
              borderRadius: radius.card,
              backgroundColor: over ? c.accentSoft : c.backgroundSunken,
            }}
          >
            <Text variant="footnote" tone={over ? "red" : "secondary"}>
              {itinerary.budget_note}
            </Text>
          </View>
        ) : null}

        {/* Built around them */}
        {itinerary.personal_summary ? (
          <View
            style={{
              marginHorizontal: GUTTER,
              marginBottom: space.xl,
              padding: space.lg,
              borderRadius: radius.card,
              backgroundColor: c.backgroundElement,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.xs }}>
              <Symbol name="heart.fill" size={13} />
              <Text variant="caption1" tone="tint" weight="700" style={{ letterSpacing: 0.6 }}>
                BUILT AROUND THEM
              </Text>
            </View>
            <Text variant="subheadline" tone="secondary">
              {itinerary.personal_summary}
            </Text>
          </View>
        ) : null}

        {/* Timeline */}
        <View style={{ paddingHorizontal: GUTTER }}>
          {itinerary.stops.map((stop, i) => (
            <Fragment key={`${stop.venue_id}-${i}`}>
              <StopCard
                stop={stop}
                index={i}
                swapping={false}
                reserving={reservingIndex === i}
                onSwap={() => handleSwap(i)}
                onReserve={() => void handleReserve(i)}
                onReported={setToast}
                onOrdersChange={(orders) => handleOrdersChange(i, orders)}
              />
              {itinerary.hops[i] && i < itinerary.stops.length - 1 ? (
                <Hop mins={itinerary.hops[i].mins} cost={itinerary.hops[i].cost_ghs} />
              ) : null}
            </Fragment>
          ))}
        </View>

        <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl, gap: space.sm }}>
          <Button title="Add to calendar" kind="gray" icon="calendar" onPress={handleAddToCalendar} />
          <Button title="Edit my answers" kind="plain" onPress={onEdit} />
          {/* A second way out. The header back button is the primary one, but
              this screen is where people stop, so the exit should be visible
              at the point they finish reading rather than only at the top. */}
          <Button
            title="Done, back to home"
            kind="plain"
            onPress={() => router.dismissTo("/")}
          />
        </View>

        <Text
          variant="caption1"
          tone="tertiary"
          center
          style={{ paddingHorizontal: GUTTER, marginTop: space.lg }}
        >
          Prices can change. Transport is an estimate.
        </Text>
      </ScrollView>

      <ActionBar>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              title={shareSlug ? "Share plan" : "Save & share"}
              icon="square.and.arrow.up"
              onPress={handleShare}
              loading={saving}
            />
          </View>
          <Button title="Email" kind="gray" icon="envelope" onPress={handleEmail} />
        </View>
      </ActionBar>

      <Toast message={toast} onDone={() => setToast(null)} />
    </View>
  );
}

/** "5:30 PM" on a given ISO date to a real Date, or null if unparseable. */
function parseStopStart(isoDate: string, arrival: string): Date | null {
  const m = arrival.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;

  let hour = Number(m[1]);
  const mins = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();

  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  const [y, mo, d] = isoDate.split("-").map(Number);
  return new Date(y, mo - 1, d, hour, mins, 0, 0);
}
