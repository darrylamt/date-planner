import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Alert,
  InteractionManager,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
/*
 * The legacy entry point, deliberately.
 *
 * expo-calendar 57 deprecated the functional API and made the deprecation
 * throw rather than warn: requestCalendarPermissionsAsync imported from
 * "expo-calendar" raises "Method ... is deprecated" and the permission
 * dialog never appears. Three builds were spent looking for the cause in the
 * Info.plist and in iOS 17's permission split, because the message the user
 * saw was our own "could not add to your calendar" and it fitted that story
 * perfectly.
 *
 * "expo-calendar/legacy" is the same functions, supported, and keeps this
 * file unchanged. Migrating to the object-oriented API in ./next is the
 * eventual move, but not on the build before an App Store submission.
 */
import * as Calendar from "expo-calendar/legacy";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Button, ActionBar } from "../Button";
import { Symbol } from "../Symbol";
import { Toast } from "../Toast";
import { BudgetBar, Hop } from "./BudgetBar";
import { StopCard } from "./StopCard";
import { GUTTER, HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs, instagramUrl, longDate } from "../../lib/format";
import { chargeableSubtotal, chargesOn, chargesTotal, isDriving } from "../../lib/budget";
import { partyLabel } from "../../lib/planConstants";
import { createReservation, fetchVenueContact, setPlannerNote } from "../../lib/data";
import { planEmailHtml, planMailto } from "../../lib/planEmail";
import { nativeOptional } from "../../lib/nativeOptional";
import { chooseAction } from "../../lib/actionSheet";
import { canFollow, follow, followingSlug, refreshLiveActivity, unfollow } from "../../lib/liveActivity";
import { whenWord, whereTheNightIs } from "../../lib/nightClock";
import { shakeAvailable, useShake } from "../../lib/shake";
import { fetchNextSpots, type NextSpot } from "../../lib/api";
import { NextSpotSheet } from "./NextSpotSheet";
import { afterSharing } from "../../lib/review";
import { billFromPlan, setBillSource } from "../../lib/bill";
import { swapStopLocally } from "../../lib/swapStop";
import { NoteSheet } from "./NoteSheet";
import { PickupSheet } from "./PickupSheet";
import { giftsForOccasion, pickupLine, pickupTotal } from "../../lib/pickups";
import type { PickupChoice } from "../../lib/pickups";
import type {
  Itinerary,
  ItineraryOrder,
  PlanInputs,
  StopAlternate,
} from "../../lib/types";

const WEB_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/*
 * The Mail composer arrived with the 1.1.0 build. Resolved defensively, so a
 * phone on an older binary that gets this bundle over the air sends the
 * plain email instead of losing the button.
 */
function mailComposer() {
  return nativeOptional(() => require("expo-mail-composer") as typeof import("expo-mail-composer"));
}

export function ItineraryView({
  inputs,
  itinerary,
  onItineraryChange,
  onEdit,
  onSave,
  shareSlug,
  saving,
  initialNote = null,
}: {
  inputs: PlanInputs;
  itinerary: Itinerary;
  onItineraryChange: (it: Itinerary) => void;
  onEdit: () => void;
  /** Persists the plan and resolves to its share slug (null if not signed in). */
  onSave: () => Promise<string | null>;
  shareSlug: string | null;
  saving: boolean;
  /** The note already on the saved plan, if this is one. */
  initialNote?: string | null;
}) {
  const c = useTheme();
  const [reservingIndex, setReservingIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // "share" is the note asked for on the way to the share sheet; "edit" is
  // changing it afterwards from the card, with no share at the end.
  const [noteMode, setNoteMode] = useState<"share" | "edit">("share");
  const [note, setNote] = useState<string | null>(initialNote?.trim() || null);
  useEffect(() => setNote(initialNote?.trim() || null), [initialNote]);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickup, setPickup] = useState<PickupChoice | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  /*
   * Tonight on the Lock Screen. Offered from six hours before the first stop
   * until the last one ends, on a saved plan (the activity opens it by its
   * link), and kept in step when a stop is swapped while it is followed.
   */
  const followable = canFollow(shareSlug, inputs, itinerary);
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    let live = true;
    void followingSlug().then((s) => live && setFollowing(Boolean(shareSlug) && s === shareSlug));
    return () => {
      live = false;
    };
  }, [shareSlug]);
  useEffect(() => {
    if (following && shareSlug) void refreshLiveActivity({ slug: shareSlug, inputs, itinerary });
  }, [following, shareSlug, inputs, itinerary]);

  /*
   * Where next: on the night, from the stop it has reached. Shaking the phone
   * asks (from build 24, which can feel it), and so does the button, so it
   * is never only a hidden gesture. One request brings a short list; each
   * shake after moves along it, and the end of it asks again for more.
   */
  const nightOn = whereTheNightIs(inputs, itinerary) != null;
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const [nextOpen, setNextOpen] = useState(false);
  const [nextLoading, setNextLoading] = useState(false);
  const [spots, setSpots] = useState<NextSpot[]>([]);
  const [spotIndex, setSpotIndex] = useState(0);
  const [rideFrom, setRideFrom] = useState<{ lat: number; lng: number } | null>(null);

  async function whereNext() {
    if (nextLoading) return;
    setNextOpen(true);
    if (spotIndex + 1 < spots.length && nextOpen) {
      void Haptics.selectionAsync();
      setSpotIndex((i) => i + 1);
      return;
    }
    const at = whereTheNightIs(inputs, itinerary);
    if (!at) return;
    setNextLoading(true);
    const res = await fetchNextSpots({
      anchorVenueId: itinerary.stops[at.anchor]?.venue_id ?? null,
      date: at.date,
      time: at.time,
      occasion: inputs.occasion,
      vibes: inputs.vibes ?? [],
      partySize: inputs.partySize,
      city: inputs.city,
      // Not anywhere already in the plan, nor anywhere already shown tonight.
      exclude: [
        ...itinerary.stops.map((s) => s.venue_id).filter((id): id is string => Boolean(id)),
        ...spots.map((s) => s.id),
      ].slice(0, 40),
    });
    setNextLoading(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (res && res.spots.length) {
      setSpots(res.spots);
      setSpotIndex(0);
      setRideFrom(res.from);
    } else {
      setSpots([]);
      setSpotIndex(0);
    }
  }

  useShake(() => void whereNext(), focused && nightOn);

  async function toggleFollow() {
    if (!shareSlug) return;
    if (following) {
      await unfollow();
      setFollowing(false);
      setToast("Off your Lock Screen.");
      return;
    }
    const said = await follow(shareSlug, inputs, itinerary);
    setFollowing((await followingSlug()) === shareSlug);
    setToast(said);
  }

  const over = itinerary.est_total_ghs > inputs.budget;
  // Read from the inputs rather than inferred from a zero hop cost: an old
  // plan saved before this existed has real fares and must keep showing them.
  const driving = isDriving(inputs);

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
    const stop = itinerary.stops[index];
    /*
     * The venue's service charge and tax follow the order: add a dish and
     * they grow with it. A plan from before charges were recorded carries no
     * rates and keeps whatever charges it was given, which is none.
     */
    const charges = stop?.charge_rates ? chargesOn(chargeableSubtotal(orders), stop.charge_rates) : (stop?.charges ?? []);
    const stopCost = Math.round(orders.reduce((sum, o) => sum + Number(o.price_ghs), 0) + chargesTotal(charges));
    const stops = itinerary.stops.map((s, i) =>
      i === index ? { ...s, orders, charges, est_cost_ghs: stopCost } : s
    );
    const food = Math.round(stops.reduce((sum, s) => sum + Number(s.est_cost_ghs), 0));
    const est = Math.round(food + Number(itinerary.transport_total_ghs));

    onItineraryChange({ ...itinerary, stops, food_total_ghs: food, est_total_ghs: est });

    if (est > inputs.budget) {
      setToast(`Heads up, now ${ghs(est - inputs.budget)} over budget`);
    }
  }

  /**
   * Ask before booking anything, and offer every way they can be reached.
   *
   * Reserve is the one action on this screen that reaches outside the app and
   * cannot be taken back, so it still asks first, naming the venue, the day
   * and the time, because "are you sure" on its own asks somebody to remember
   * what they tapped.
   *
   * The venue's channels are fetched before the question rather than after,
   * so the question can be the choice: one dialog whose buttons are the ways
   * this place actually takes bookings. It used to pick one channel on their
   * behalf and, for a place with none on file, end at "we will follow up" --
   * which nobody did.
   *
   * WhatsApp is offered on the ordinary phone number too, labelled as a try.
   * Most of those numbers are lines somebody answers rather than WhatsApp
   * accounts, which is why this never opened WhatsApp silently; offered as a
   * choice beside Call, the person decides, and WhatsApp itself says so when a
   * number is not on it.
   */
  async function handleReserve(index: number) {
    if (reservingIndex !== null) return;
    const stop = itinerary.stops[index];
    setReservingIndex(index);

    let contact: Awaited<ReturnType<typeof fetchVenueContact>> = null;
    try {
      contact = await fetchVenueContact(stop.venue_id);
    } catch {
      contact = null;
    } finally {
      setReservingIndex(null);
    }

    const when = `${longDate(inputs.date)} at ${stop.arrival_time}`;
    const who = partyLabel(inputs.partySize);
    const message =
      `Hello ${stop.name}! I would like to reserve a table for ${who} on ${when}. ` +
      `Please confirm availability. (sent via Duro)`;

    /*
     * The event's own link first, then the venue's.
     *
     * A ticketed night at a restaurant is not booked through the restaurant,
     * and sending somebody to the venue's table-booking page for a festival
     * is sending them to the wrong place confidently.
     */
    const booking = stop.event?.booking_url?.trim() || contact?.booking_url?.trim() || null;
    const whatsapp = waNumber(contact?.whatsapp_phone) ?? waNumber(contact?.phone);
    const dial = contact?.phone?.replace(/[^\d+]/g, "") || null;
    const instagram = instagramUrl(contact?.instagram_handle ?? stop.instagram_handle);

    const channels: { text: string; open: () => Promise<void>; toast: string }[] = [];
    if (booking) {
      channels.push({
        text: "Booking page",
        open: () => Linking.openURL(booking),
        toast: "Opening their booking page.",
      });
    }
    if (whatsapp) {
      channels.push({
        text: contact?.whatsapp_phone ? "WhatsApp" : "Try WhatsApp",
        open: () => Linking.openURL(`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`),
        toast: "Message written, send it and they will confirm.",
      });
    }
    if (dial) {
      channels.push({
        text: "Call",
        open: () => Linking.openURL(`tel:${dial}`),
        toast: "Calling them.",
      });
    }
    if (instagram) {
      channels.push({
        text: "Message on Instagram",
        open: () => Linking.openURL(instagram),
        toast: "Opening their Instagram, a DM usually gets an answer.",
      });
    }

    if (!channels.length) {
      const maps = stop.google_maps_url;
      Alert.alert(
        "No way to book this one yet",
        `We have no booking page, number or Instagram for ${stop.name}. Most places like it take walk-ins, and the map listing sometimes has a number we do not.`,
        [
          { text: "OK", style: "cancel" },
          ...(maps ? [{ text: "Open map listing", onPress: () => void Linking.openURL(maps) }] : []),
        ]
      );
      return;
    }

    // How to reach them is a choice of what to do next, so it is asked the way the phone asks those.
    chooseAction({
      title: "Request a table?",
      message: `${stop.name}, ${when}, for ${who}.\n\nChoose how to reach them. We keep a note of the request either way.`,
      actions: channels.map((ch) => ({ text: ch.text, onPress: () => void reserveVia(index, ch) })),
      cancel: "Not yet",
    });
  }

  /** Log the request (our system of record), then hand over to the channel they picked. */
  async function reserveVia(index: number, channel: { open: () => Promise<void>; toast: string }) {
    if (reservingIndex !== null) return;
    const stop = itinerary.stops[index];
    setReservingIndex(index);
    try {
      /*
       * Logged but not waited on: a slow write must not sit between somebody
       * and the venue they are trying to reach, and a failed one loses our
       * note of it, not their table.
       */
      void createReservation({
        venueId: stop.venue_id,
        venueName: stop.name,
        planSlug: shareSlug,
        /*
         * The size they actually asked for. This was hardcoded to two, which
         * was true while every pathway was an evening for a couple.
         */
        partySize: inputs.partySize,
        date: inputs.date,
        arrivalTime: stop.arrival_time,
        guestName: inputs.partner.name,
      }).catch(() => undefined);

      await channel.open();
      const stops = itinerary.stops.map((s, i) =>
        i === index ? { ...s, reservation_requested: true } : s
      );
      onItineraryChange({ ...itinerary, stops });
      setToast(channel.toast);
    } catch {
      setToast("Could not open that. Try another way.");
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
    /*
     * The designed email where the phone can compose one: Apple Mail with an
     * account set up. Anywhere else, Gmail or a phone with no Mail account or
     * a build from before the composer was added, a mailto link can only
     * carry plain text, so it gets the plain version, which says the same.
     */
    const composer = mailComposer();
    if (composer) {
      try {
        if (await composer.isAvailableAsync()) {
          const { subject, html } = planEmailHtml(itinerary, inputs, url, note);
          await composer.composeAsync({ subject, body: html, isHtml: true });
          return;
        }
      } catch {
        // Fall through to the plain one.
      }
    }
    try {
      await Linking.openURL(planMailto(itinerary, inputs.date, url, "", note));
    } catch {
      setToast("No mail app is set up on this device.");
    }
  }

  /**
   * Ask for a line to go on the card before sending it.
   *
   * Prompted at the moment of sharing rather than during planning, which is
   * when someone actually knows what they want to say, and skippable because
   * a card with no note is the normal case rather than an unfinished one.
   */
  async function handleShare() {
    const slug = shareSlug ?? (await onSave());
    if (!slug) return; // onSave surfaced the sign-in prompt

    // The sheet decides; sharing continues in shareWith once it closes.
    setPendingSlug(slug);
    setNoteMode("share");
    setNoteOpen(true);
  }

  /** Change or clear the note later, from the card that shows it. */
  async function saveNoteOnly(text: string | null) {
    setNoteOpen(false);
    if (!shareSlug || text == null) return;
    const saved = await setPlannerNote(shareSlug, text);
    if (!saved) {
      setToast("The note did not save. Try again.");
      return;
    }
    setNote(text.trim() || null);
    setToast(text.trim() ? "Note saved. They will see it when they open the link." : "Note removed.");
  }

  /**
   * Save the note if one was written, then open the share sheet either way.
   *
   * The wait is not padding. iOS will not present the share sheet while
   * another modal is still on screen, and the note sheet is a modal that has
   * only just been told to close, so calling Share.share in the same tick puts
   * it behind a view that is mid-dismissal and nothing appears. "Add it and
   * share" happened to work by accident, because awaiting the note save gave
   * the dismissal time it needed; "Share without a note" has nothing to await
   * and so did nothing at all.
   */
  async function shareWith(picked: string | null) {
    const slug = pendingSlug;
    setNoteOpen(false);
    setPendingSlug(null);
    if (!slug) return;

    /*
     * "Share without a note" on a plan that already has one means without it,
     * so the old note comes off rather than riding along unseen by the sender.
     */
    const wanted = picked ?? (note ? "" : null);
    if (wanted != null) {
      const saved = await setPlannerNote(slug, wanted);
      if (saved) setNote(wanted.trim() || null);
      else setToast("The note did not save, sharing anyway.");
    }
    const sending = picked?.trim() || null;

    await waitForModalToClose();

    const url = `${WEB_URL}/p/${slug}`;
    /*
     * The note leads the message as well as the page, so it is read in the
     * chat even by somebody who never taps the link.
     */
    const said = sending
      ? `"${sending}"\n\nOur plan for ${longDate(inputs.date)}`
      : `Our plan for ${longDate(inputs.date)}`;
    try {
      /*
       * The link goes in exactly one of these, and which one depends on the
       * platform.
       *
       * iOS treats `message` and `url` as two separate items and hands both to
       * whatever you picked, so a message with the link already in it arrives
       * in WhatsApp as the sentence followed by the same link again. Android
       * ignores `url` entirely, so leaving it out there would send a sentence
       * with nothing to tap.
       */
      const result = await Share.share(
        Platform.OS === "ios" ? { message: said, url } : { message: `${said}, ${url}` }
      );
      // Sent, not just opened: the moment to perhaps ask for a rating (see review.ts).
      if (result.action === Share.sharedAction) void afterSharing();
    } catch {
      setToast("Could not open the share sheet.");
    }
  }

  /** Writes each stop to the phone's calendar as its own timed event. */
  /**
   * Put every stop in the phone's calendar.
   *
   * ── why finding the calendar is the hard part ───────────────────────────
   * iOS 17 split calendar permission in two. An app can be granted write-only
   * access, which is enough to add an event and not enough to list calendars,
   * and getDefaultCalendarAsync reads before it writes. On a phone that
   * granted write-only it throws, the old catch reported "could not add to
   * your calendar", and there was nothing anywhere saying which of a dozen
   * things had gone wrong.
   *
   * So: ask for full access, fall back to enumerating and picking something
   * modifiable, and if even that fails say what the phone actually said rather
   * than a sentence that fits every failure equally badly.
   */
  async function handleAddToCalendar() {
    /*
     * Every failure below says which one it was.
     *
     * This has been "fixed" twice from a guess -- first by hardening the
     * JavaScript, then by adding the Info.plist key iOS 17 needs -- and it
     * has failed twice more, because "could not add to your calendar" fits
     * eight different causes equally well and names none of them. A message
     * that cannot distinguish a denied permission from a phone with no
     * writable calendar is a message that costs a round trip every time.
     */
    let status: string;
    let canAskAgain: boolean;
    try {
      const perm = await Calendar.requestCalendarPermissionsAsync();
      status = perm.status;
      canAskAgain = perm.canAskAgain;
    } catch (e) {
      setToast(`Calendar permission failed: ${(e as Error)?.message ?? "unknown"}`);
      return;
    }

    if (status !== "granted") {
      Alert.alert(
        "Calendar access needed",
        (canAskAgain
          ? "Duro needs permission to add your plan to your calendar."
          : "Turn on Calendars for Duro in Settings, then try again.") + `\n\n(status: ${status})`,
        [
          { text: "Not now", style: "cancel" },
          ...(canAskAgain
            ? []
            : [{ text: "Open Settings", onPress: () => void Linking.openSettings() }]),
        ]
      );
      return;
    }

    try {
      /*
       * The default calendar where there is one, otherwise the first that will
       * actually accept an event. A phone with only subscribed calendars, and
       * one granted write-only access, both land here rather than failing.
       */
      let calendarId: string | null = null;
      let why = "";
      try {
        calendarId = (await Calendar.getDefaultCalendarAsync())?.id ?? null;
        if (!calendarId) why = "no default calendar";
      } catch (e) {
        why = `default lookup threw: ${(e as Error)?.message ?? "unknown"}`;
      }

      if (!calendarId) {
        try {
          const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
          const writable = all.filter((cal) => cal.allowsModifications);
          calendarId = writable[0]?.id ?? null;
          if (!calendarId) why = `${all.length} calendars, none writable`;
        } catch (e) {
          why = `${why}; listing threw: ${(e as Error)?.message ?? "unknown"}`;
        }
      }

      if (!calendarId) {
        setToast(`No calendar accepted the event (${why}).`);
        return;
      }

      /*
       * Counted rather than assumed. A stop whose time cannot be parsed is
       * skipped, and silently skipping all of them while reporting success is
       * how somebody turns up to an empty calendar on the night.
       */
      let added = 0;
      for (const stop of itinerary.stops) {
        const start = parseStopStart(inputs.date, stop.arrival_time);
        if (!start) continue;
        const end = new Date(start.getTime() + stop.duration_mins * 60_000);

        await Calendar.createEventAsync(calendarId, {
          title: `${stop.label}: ${stop.name}`,
          startDate: start,
          endDate: end,
          location: `${stop.name}, ${stop.area}, Accra`,
          notes: stop.why_this_fits,
        });
        added += 1;
      }

      if (!added) {
        const sample = itinerary.stops[0]?.arrival_time ?? "(no stops)";
        setToast(`Could not read the times on this plan (first was "${sample}").`);
        return;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast(added === 1 ? "Added to your calendar" : `${added} stops added to your calendar`);
    } catch (e) {
      // The phone's own words. A generic sentence here fits every failure
      // equally badly and tells nobody what to do next.
      const said = (e as Error)?.message?.trim();
      setToast(said ? `Calendar said: ${said}` : "Could not add to your calendar.");
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
          {/*
            Above the itinerary, because it happens before it. A pickup is an
            errand rather than a stop: it costs money and four minutes, so it
            joins the total without taking a slot in the evening.
          */}
          {giftsForOccasion(inputs.occasion).length ? (
            <Pressable
              onPress={() => setPickupOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                backgroundColor: c.backgroundElement,
                borderRadius: radius.card,
                padding: space.md,
                marginBottom: space.md,
                borderWidth: pickup ? 1.5 : HAIRLINE,
                borderColor: pickup ? c.accent : c.border,
              }}
            >
              <Symbol
                name={pickup?.kind === "cake" ? "birthday.cake.fill" : "leaf.fill"}
                size={22}
                color={c.accent}
              />
              <View style={{ flex: 1 }}>
                <Text variant="body" numberOfLines={1}>
                  {pickup ? pickupLine(pickup) : "Pick something up on the way"}
                </Text>
                <Text variant="footnote" tone="secondary" numberOfLines={1}>
                  {pickup
                    ? [
                        ghs(pickupTotal(pickup)),
                        pickup.message ? `"${pickup.message}"` : null,
                        pickup.colour,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : giftsForOccasion(inputs.occasion).includes("cake")
                      ? "Flowers or a cake, collected before you set off"
                      : "Flowers, collected before you set off"}
                </Text>
              </View>
              {pickup ? (
                <Pressable onPress={() => setPickup(null)} hitSlop={10}>
                  <Symbol name="xmark.circle.fill" size={20} color={c.textTertiary} />
                </Pressable>
              ) : (
                <Symbol name="plus.circle.fill" size={22} color={c.accent} />
              )}
            </Pressable>
          ) : null}

          <BudgetBar
            estimated={itinerary.est_total_ghs + (pickup ? pickupTotal(pickup) : 0)}
            budget={inputs.budget}
            food={itinerary.food_total_ghs + (pickup ? pickupTotal(pickup) : 0)}
            transport={itinerary.transport_total_ghs}
            confidence={itinerary.price_confidence}
            driving={driving}
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

        {/*
          The note, where the sender can see it again. It used to go straight
          to the shared page and never come back, so nobody who had written
          one could check it or change it.
        */}
        {shareSlug && note ? (
          <Pressable
            onPress={() => {
              setNoteMode("edit");
              setNoteOpen(true);
            }}
            style={{
              marginHorizontal: GUTTER,
              marginBottom: space.xl,
              padding: space.lg,
              borderRadius: radius.card,
              backgroundColor: c.accentSoft,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: space.xs }}>
              <Symbol name="envelope.fill" size={13} color={c.accent} />
              <Text variant="caption1" tone="tint" weight="700" style={{ flex: 1, letterSpacing: 0.6 }}>
                YOUR NOTE
              </Text>
              <Text variant="footnote" tone="tint" weight="600">
                Edit
              </Text>
            </View>
            <Text variant="body">{note}</Text>
            <Text variant="caption1" tone="secondary" style={{ marginTop: space.xs }}>
              In your message, and at the top of the plan when they open the link.
            </Text>
          </Pressable>
        ) : null}

        {/* Timeline */}
        <View style={{ paddingHorizontal: GUTTER }}>
          {itinerary.stops.map((stop, i) => (
            <Fragment key={`${stop.venue_id}-${i}`}>
              <StopCard
                stop={stop}
                previous={i > 0 ? itinerary.stops[i - 1] : null}
                index={i}
                swapping={false}
                reserving={reservingIndex === i}
                onSwap={() => handleSwap(i)}
                onReserve={() => void handleReserve(i)}
                onReported={setToast}
                onOrdersChange={(orders) => handleOrdersChange(i, orders)}
              />
              {itinerary.hops[i] && i < itinerary.stops.length - 1 ? (
                <Hop
                  mins={itinerary.hops[i].mins}
                  cost={itinerary.hops[i].cost_ghs}
                  driving={driving}
                />
              ) : null}
            </Fragment>
          ))}
        </View>

        <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl, gap: space.sm }}>
          {nightOn ? (
            <Button title="Where next?" kind="tinted" icon="sparkles" onPress={() => void whereNext()} />
          ) : null}
          {followable ? (
            <Button
              // A morning plan is not "tonight".
              title={following ? "Stop following on Lock Screen" : `Follow ${whenWord(inputs, itinerary)} on Lock Screen`}
              kind="gray"
              icon="lock.iphone"
              onPress={() => void toggleFollow()}
            />
          ) : null}
          {/*
            The money, for a plan with company: the wheel to settle who pays,
            and the split to settle it fairly, both starting from this plan.
          */}
          {inputs.partySize >= 2 ? (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Split the bill"
                  kind="gray"
                  icon="banknote"
                  onPress={() => {
                    setBillSource(billFromPlan(inputs, itinerary));
                    router.push("/split");
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Who pays?"
                  kind="gray"
                  icon="dice.fill"
                  onPress={() => {
                    setBillSource(billFromPlan(inputs, itinerary));
                    router.push({ pathname: "/who-pays", params: { count: String(inputs.partySize) } });
                  }}
                />
              </View>
            </View>
          ) : null}
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
          {driving
            ? "Prices can change. No Uber or Bolt fares in this total."
            : "Prices can change. Transport is an estimate."}
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

      <PickupSheet
        visible={pickupOpen}
        onClose={() => setPickupOpen(false)}
        occasion={inputs.occasion}
        date={inputs.date}
        startTime={inputs.startTime}
        onChoose={(choice) => {
          setPickup(choice);
          setToast(`Added. ${pickupLine(choice)}.`);
        }}
      />

      <NextSpotSheet
        visible={nextOpen}
        onClose={() => setNextOpen(false)}
        spot={spots[spotIndex] ?? null}
        loading={nextLoading}
        from={rideFrom}
        shakeHint={shakeAvailable()}
        onAnother={() => void whereNext()}
      />

      <NoteSheet
        visible={noteOpen}
        mode={noteMode}
        initial={note ?? ""}
        onClose={() => {
          setNoteOpen(false);
          setPendingSlug(null);
        }}
        onDone={(text) => void (noteMode === "edit" ? saveNoteOnly(text) : shareWith(text))}
      />

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

/**
 * Long enough for a sheet to finish going away.
 *
 * iOS refuses to present one modal over another, and there is no promise to
 * await for a React Native Modal's dismissal on both platforms: onDismiss is
 * iOS only. So this waits out the animation, after the interaction queue has
 * drained, which is the part that actually matters on a slower phone.
 */
function waitForModalToClose(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => setTimeout(resolve, 320));
  });
}

/**
 * A number in the form wa.me wants: country code, digits only.
 *
 * Numbers are recorded the way a poster prints them, and a Ghanaian one is
 * usually written with the leading 0 in place of 233. wa.me given 0244...
 * opens a chat with nobody.
 */
function waNumber(raw: string | null | undefined): string | null {
  const d = raw?.replace(/\D/g, "") ?? "";
  if (!d) return null;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0") && d.length === 10) return `233${d.slice(1)}`;
  return d.length >= 10 ? d : null;
}
