import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { StopGallery } from "./StopGallery";
import { MenuSheet } from "./MenuSheet";
import { ReportSheet } from "./ReportSheet";
import { GettingThereSheet } from "./GettingThereSheet";
import { HAIRLINE, radius, space } from "../../theme";
import { useIsDark, useTheme } from "../../lib/useTheme";
import { chooseAction } from "../../lib/actionSheet";
import { ghs, instagramUrl, time12 } from "../../lib/format";
import { track } from "../../lib/signals";
import { QtyStepper } from "./QtyStepper";
import type { ItineraryOrder, ItineraryStop } from "../../lib/types";

/**
 * One stop on the timeline: photo, timing, what you are ordering (editable),
 * why it fits, and the actions that only make sense here.
 */
export function StopCard({
  stop,
  previous = null,
  index,
  onSwap,
  onOrdersChange,
  onReserve,
  onReported,
  swapping,
  reserving,
  locked = false,
}: {
  stop: ItineraryStop;
  /** The stop before this one, which is where they will be setting off from. */
  previous?: ItineraryStop | null;
  index: number;
  onSwap: () => void;
  onOrdersChange: (orders: ItineraryOrder[]) => void;
  onReserve: () => void;
  onReported: (message: string) => void;
  swapping: boolean;
  reserving: boolean;
  /**
   * A group outing's plan: everyone's orders were sized to their own budgets,
   * so nobody may swap the venue or edit the shared lines from one phone.
   */
  locked?: boolean;
}) {
  const c = useTheme();
  const dark = useIsDark();
  /*
   * Closed by default: the card says where, when, why in a line or two, and
   * what it costs; the orders, the menus and the long words open on a tap.
   * Every stop showing everything at once made a plan a wall of text that
   * people scrolled past rather than read.
   */
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);

  const editable = stop.kind !== "event" && !locked;
  /*
   * Places you do something at. Read from the venue's own type rather than
   * guessed from the menu, so the button is there before anything is fetched
   * and does not flicker in once a sheet has been opened. A plan saved before
   * venue_type existed carries none, and simply keeps the old actions.
   */
  const isActivityVenue = stop.venue_type === "activity" || stop.venue_type === "outdoor";
  /*
   * Either the place needs booking, or tonight does.
   *
   * These are different facts and only one used to be asked. A restaurant
   * that takes walk-ins all year still sells tickets for the night it puts a
   * band on, and until the event could say so the plan sent people to a door
   * that was already full.
   */
  /*
   * Where there is a ticket to buy, that is the action, not a table.
   *
   * The event's own link, shown as its own button rather than folded into
   * Reserve: "Reserve" at a festival reads as booking dinner, and a ticket
   * page needs no confirmation because opening it commits to nothing.
   */
  const tickets = stop.event?.booking_url?.trim() || null;
  /** A cinema showing (movies.ts on the server), not an organised night. */
  const movie = Boolean(stop.event?.id?.startsWith("movie:"));
  /*
   * Every restaurant, not only the ones that insist on booking.
   *
   * Gated on reservation_required this showed on four restaurants out of a
   * hundred and twenty, which read as the feature not existing. A table for
   * a Saturday is worth asking for at most places that would also take the
   * walk-in; the dialog behind the button offers whichever ways this one can
   * be reached, and says so plainly when there are none.
   */
  const canReserve =
    !tickets &&
    (stop.venue_type === "restaurant" ||
      stop.reservation_required ||
      stop.event?.reservation_required === true) &&
    !stop.reservation_requested;

  /** Quantity stepper. Dropping to zero removes the line entirely. */
  function changeQty(at: number, delta: number) {
    // One more of a dish says they want it; taking it off says the opposite (taste, on the server).
    const line = stop.orders[at];
    if (line && delta > 0) track("dish_added", stop.venue_id, { item: line.item });
    if (line && delta < 0 && line.qty <= 1) track("dish_removed", stop.venue_id, { item: line.item });
    const next: ItineraryOrder[] = [];
    stop.orders.forEach((o, i) => {
      if (i !== at) {
        next.push(o);
        return;
      }
      const unit = o.qty > 0 ? o.price_ghs / o.qty : o.price_ghs;
      const qty = o.qty + delta;
      if (qty >= 1) next.push({ ...o, qty, price_ghs: Math.round(unit * qty) });
    });
    onOrdersChange(next);
  }

  /*
   * Handles are stored as "@name" and occasionally as a pasted profile URL, so
   * the link is derived rather than concatenated. A handle that does not parse
   * gives null, and the action greys out, which is the right answer: an action
   * that opens a page which does not exist is worse than one that is plainly
   * unavailable.
   */
  const instagram = instagramUrl(stop.instagram_handle);
  /*
   * Stripped to what tel: will dial. Organisers type a number the way it
   * appears on the poster -- spaces, brackets, a leading 0 -- and the phone
   * will not open a URL containing any of it.
   */
  const organiser = stop.event?.contact_phone?.replace(/[^\d+]/g, "") || null;
  /*
   * Which order line is showing its note, by index.
   *
   * One at a time and closed by default: the note is an answer to "what is
   * that", and a card that volunteers every answer at once is a menu again.
   */
  const [openNote, setOpenNote] = useState<number | null>(null);

  /** One line for the closed card: what is being ordered, in brief. */
  const summary = stop.orders.length
    ? `${stop.orders.slice(0, 2).map((o) => sentenceCase(o.item)).join(", ")}${stop.orders.length > 2 ? ` +${stop.orders.length - 2} more` : ""}`
    : isActivityVenue
      ? "What you can do here"
      : "See what to order";
  const reason = stop.what_to_do?.trim() || stop.why_this_fits?.trim() || stop.event?.description?.trim() || "";

  /** Everything used once in a hundred stops, in the phone's own action sheet. */
  function more() {
    void Haptics.selectionAsync();
    chooseAction({
      title: stop.name,
      dark,
      actions: [
        // What they reached for at this stop: part of the venue's pull (signals.ts).
        { text: "Open in Maps", onPress: () => (track("maps_opened", stop.venue_id), openMaps()) },
        ...(instagram
          ? [{ text: "Instagram", onPress: () => (track("instagram_opened", stop.venue_id), void Linking.openURL(instagram)) }]
          : []),
        ...(organiser ? [{ text: "Call the organiser", onPress: () => void Linking.openURL(`tel:${organiser}`) }] : []),
        { text: "Report a problem", onPress: () => setReportOpen(true) },
      ],
    });
  }

  function openMaps() {
    const url =
      stop.google_maps_url ??
      `https://maps.apple.com/?q=${encodeURIComponent(`${stop.name} ${stop.area} Accra`)}`;
    void Linking.openURL(url);
  }

  return (
    <View
      style={{
        backgroundColor: c.backgroundElement,
        borderRadius: radius.card,
        overflow: "hidden",
        opacity: swapping ? 0.5 : 1,
      }}
    >
      {/*
        Falls back to the single hero for a plan saved before galleries
        existed, which is every plan made until now: those carry image_url and
        nothing else, and must still show their picture.
      */}
      <StopGallery
        images={stop.images ?? (stop.image_url ? [stop.image_url] : [])}
        alt={stop.event?.title ?? stop.name}
        // An event's poster leads its pictures (picturesOf in itinerary.ts).
        poster={Boolean(stop.event?.image_url)}
      />

      <View style={{ padding: space.lg, gap: space.sm }}>
        {/* Label + time */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="caption1" tone="tint" weight="700" style={{ letterSpacing: 0.6 }}>
            {/* The label is the event's title, which is now the heading below. */}
            {(movie ? "Movie" : stop.event ? "Event" : stop.label).toUpperCase()}
          </Text>
          <Text variant="caption1" tone="secondary" tabular>
            {stop.arrival_time} · {stop.duration_mins} min
          </Text>
        </View>

        {/*
          On an event stop the event is the heading and the venue is where it
          is. Swap sits beside the name, filled, where people looking to
          change a stop already are.
        */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            {stop.event ? <Text variant="title3">{stop.event.title}</Text> : <Text variant="title3">{stop.name}</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <Symbol name="mappin" size={12} color={c.textSecondary} />
              <Text variant="footnote" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
                {stop.event && stop.event.title !== stop.name ? `${stop.name} · ${stop.area}` : stop.area}
              </Text>
            </View>
          </View>
          {locked ? null : <SwapButton onPress={onSwap} busy={swapping} hint={index === 0} />}
        </View>

        {/* Dated, and when it starts: the one thing the arrival time cannot say. */}
        {stop.event ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Symbol name="ticket" size={12} color={c.accent} />
            <Text variant="footnote" tone="tint" weight="600">
              {movie
                ? `Showing at ${stop.event.start_time ? time12(stop.event.start_time) : "the time above"}${stop.event.organiser_name ? ` · ${stop.event.organiser_name}` : ""}`
                : `On this date only${stop.event.start_time ? ` · starts ${time12(stop.event.start_time)}` : ""}`}
            </Text>
          </View>
        ) : null}

        {/* A night only some people can come to says so, before anybody forwards it. */}
        {stop.event?.audience && stop.event.audience !== "everyone" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              gap: space.xs,
              backgroundColor: c.accentSoft,
              borderRadius: radius.pill,
              paddingHorizontal: space.sm,
              paddingVertical: 3,
            }}
          >
            <Symbol name="person.2.fill" size={12} color={c.accent} />
            <Text variant="footnote" tone="tint" weight="700">
              {stop.event.audience === "women" ? "Ladies only" : "Men only"}
            </Text>
          </View>
        ) : null}

        {/*
          One reason, two lines until opened. A stop used to carry the event's
          description, a written line and a "why this fits" box, which often
          said the same thing three ways. The written line describes the place
          and wins; "why it fits" stands in when there is none.
        */}
        {reason ? (
          <Text variant="subheadline" tone="secondary" numberOfLines={open ? undefined : 2}>
            {reason}
          </Text>
        ) : null}

        {stop.reservation_requested ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Symbol name="checkmark.circle.fill" size={14} color={c.success} />
            <Text variant="footnote" tone="green">
              Reservation requested
            </Text>
          </View>
        ) : null}

        {/* The total, and the way into everything behind it. */}
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            if (!open) track("details_opened", stop.venue_id);
            setOpen(!open);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${open ? "Hide" : "Show"} details, stop total ${ghs(stop.est_cost_ghs)}`}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            marginTop: space.xs,
            borderTopWidth: HAIRLINE,
            borderTopColor: c.border,
            paddingTop: space.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={{ flex: 1 }}>
            <Text variant="subheadline" tone="secondary">
              Stop total
            </Text>
            <Text variant="caption1" tone="tint" weight="600" numberOfLines={1}>
              {open ? "Hide details" : summary}
            </Text>
          </View>
          <Text variant="headline" tabular>
            {ghs(stop.est_cost_ghs)}
          </Text>
          <Symbol name={open ? "chevron.up" : "chevron.down"} size={13} color={c.textSecondary} weight="semibold" />
        </Pressable>

        {open ? (
          <View style={{ gap: space.sm }}>
            {/* What the place does every week that is on while you are here. */}
            {(stop.whats_on ?? []).map((line) => (
              <View key={line} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Symbol name="music.note" size={12} color={c.textSecondary} />
                <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
                  {line}
                </Text>
              </View>
            ))}

            {stop.event?.description && stop.event.description.trim() !== reason ? (
              <Text variant="footnote" tone="secondary">
                {stop.event.description}
              </Text>
            ) : null}

            {/* Who is running the night, with their logo when they have added one. */}
            {stop.event?.organiser_name ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                {stop.event.organiser_logo_url ? (
                  <Image
                    source={{ uri: stop.event.organiser_logo_url }}
                    style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "#FFFFFF", borderWidth: HAIRLINE, borderColor: c.border }}
                    contentFit="contain"
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
                <Text variant="footnote" tone="secondary">
                  Hosted by <Text variant="footnote" weight="700">{stop.event.organiser_name}</Text>
                </Text>
              </View>
            ) : null}

            {/* Order lines with steppers */}
            {stop.orders.map((o, i) => (
              <View key={`${o.item}-${i}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 4 }}>
                  {/*
                    Tappable only where there is a note, and it says so with the
                    glyph. Kitchens name dishes for regulars, and the note is the
                    only place the plan can say what one actually is.
                  */}
                  {o.note ? (
                    <Pressable
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setOpenNote(openNote === i ? null : i);
                      }}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`What is ${o.item}`}
                      accessibilityState={{ expanded: openNote === i }}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 5 }}
                    >
                      <Text variant="subheadline" numberOfLines={2} style={{ flexShrink: 1 }}>
                        {o.item}
                      </Text>
                      <Symbol name={openNote === i ? "chevron.up.circle" : "info.circle"} size={14} color={c.textTertiary} />
                    </Pressable>
                  ) : (
                    <Text variant="subheadline" style={{ flex: 1 }} numberOfLines={2}>
                      {o.item}
                    </Text>
                  )}

                  {editable ? (
                    <QtyStepper qty={o.qty} label={o.item} onChange={(d) => changeQty(i, d)} />
                  ) : (
                    <Text variant="subheadline" tone="secondary" tabular>
                      x{o.qty}
                    </Text>
                  )}

                  <Text variant="subheadline" tabular style={{ minWidth: 74, textAlign: "right" }}>
                    {ghs(o.price_ghs)}
                  </Text>
                </View>
                {openNote === i && o.note ? (
                  <Text variant="footnote" tone="secondary" style={{ paddingBottom: 8, paddingRight: 90 }}>
                    {o.note}
                  </Text>
                ) : null}
              </View>
            ))}

            {/* What the venue adds to the bill. Not editable: it follows the order. */}
            {(stop.charges ?? []).filter((ch) => ch.ghs > 0).map((ch) => (
              <View key={ch.label} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Symbol name="percent" size={12} color={c.textSecondary} />
                <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
                  {ch.label}
                </Text>
                <Text variant="footnote" tone="secondary" tabular>
                  {ghs(ch.ghs)}
                </Text>
              </View>
            ))}

            {/* The way into the menu, right under the dishes. */}
            {editable ? (
              <BigAction
                icon={isActivityVenue ? "figure.bowling" : "fork.knife"}
                title={isActivityVenue ? "See what you can do here" : "See the full menu"}
                sub={
                  isActivityVenue
                    ? "Games, sessions and prices"
                    : stop.orders.length
                      ? "Change what you order, or add to it"
                      : "Pick something to order here"
                }
                onPress={() => {
                  track("menu_opened", stop.venue_id);
                  if (isActivityVenue) setActivityOpen(true);
                  else setMenuOpen(true);
                }}
              />
            ) : null}
            {editable && isActivityVenue ? (
              <BigAction icon="fork.knife" title="Food and drink here" sub="The menu, if they serve one"
                onPress={() => {
                  track("menu_opened", stop.venue_id);
                  setMenuOpen(true);
                }}
              />
            ) : null}
          </View>
        ) : null}

        {/*
          Three actions, not six. Getting there is the one used at every stop
          (the map is inside it); booking is the one that matters where there
          is something to book; the rest, used once in a hundred stops, are
          behind "More".
        */}
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
          <StopAction icon="car.fill" label="Get there"
            onPress={() => {
              track("directions_tapped", stop.venue_id);
              setTripOpen(true);
            }}
            grow
          />
          {tickets ? (
            <StopAction
              icon="ticket"
              label={movie ? "Book seats" : stop.event?.reservation_required ? "Book a spot" : "Tickets"}
              onPress={() => {
                track("book_tapped", stop.venue_id);
                void Linking.openURL(tickets);
              }}
              grow
            />
          ) : canReserve ? (
            <StopAction icon="phone.fill" label="Reserve"
              onPress={() => {
                track("book_tapped", stop.venue_id);
                onReserve();
              }}
              busy={reserving} grow />
          ) : null}
          <StopAction icon="ellipsis" label="More" iconOnly onPress={more} />
        </View>
      </View>

      <GettingThereSheet visible={tripOpen} onClose={() => setTripOpen(false)} stop={stop} previous={previous} />

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        venueId={stop.venue_id}
        venueName={stop.name}
        onDone={onReported}
      />

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        venueId={stop.venue_id}
        venueName={stop.name}
        orders={stop.orders}
        onOrdersChange={onOrdersChange}
      />

      <MenuSheet
        visible={activityOpen}
        onClose={() => setActivityOpen(false)}
        venueId={stop.venue_id}
        venueName={stop.name}
        orders={stop.orders}
        onOrdersChange={onOrdersChange}
        only="activity"
      />
    </View>
  );
}

const SWAP_HINT = "aduro-swap-hint-v1";
// Read once per launch, so every card does not ask storage the same question.
let hintSeen: boolean | null = null;

/**
 * Swap, where it is seen: filled in the occasion's colour, beside the name.
 *
 * On the first stop of somebody's first plan it pulses, once, until they tap
 * it. It used to add a bubble of words under itself too, which squeezed the
 * stop's name into a column three words wide.
 */
function SwapButton({ onPress, busy, hint }: { onPress: () => void; busy: boolean; hint: boolean }) {
  const c = useTheme();
  const [showHint, setShowHint] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hint) return;
    let live = true;
    (async () => {
      if (hintSeen == null) {
        try {
          hintSeen = (await AsyncStorage.getItem(SWAP_HINT)) === "1";
        } catch {
          hintSeen = true; // No storage: better never to nag than to nag always.
        }
      }
      if (live && !hintSeen) setShowHint(true);
    })();
    return () => {
      live = false;
    };
  }, [hint]);

  useEffect(() => {
    if (!showHint) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showHint, pulse]);

  function seen() {
    hintSeen = true;
    setShowHint(false);
    void AsyncStorage.setItem(SWAP_HINT, "1").catch(() => undefined);
  }

  return (
    <View style={{ alignItems: "flex-end" }}>
      <View>
        {showHint ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: radius.pill,
              backgroundColor: c.accent,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swap this stop for another place"
          disabled={busy}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (showHint) seen();
            onPress();
          }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: space.md,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: c.accent,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator size="small" color={c.textOnBrand} />
          ) : (
            <Symbol name="arrow.triangle.2.circlepath" size={14} color={c.textOnBrand} weight="semibold" />
          )}
          <Text variant="subheadline" weight="700" style={{ color: c.textOnBrand }}>
            Swap
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A menu line in ALL CAPS read as a sentence; anything else is left as the venue wrote it. */
function sentenceCase(item: string): string {
  if (item !== item.toUpperCase()) return item;
  const lower = item.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** A full-width row for an action worth finding: tinted, with a line saying what it does. */
function BigAction({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: Parameters<typeof Symbol>[0]["name"];
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        marginTop: space.xs,
        paddingHorizontal: space.md,
        paddingVertical: space.sm + 2,
        borderRadius: radius.control,
        backgroundColor: c.accentSoft,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Symbol name={icon} size={18} color={c.accent} />
      <View style={{ flex: 1 }}>
        <Text variant="subheadline" weight="700" tone="tint">
          {title}
        </Text>
        <Text variant="caption1" tone="secondary">
          {sub}
        </Text>
      </View>
      <Symbol name="chevron.right" size={14} color={c.accent} weight="semibold" />
    </Pressable>
  );
}

function StopAction({
  icon,
  glyph,
  label,
  onPress,
  busy,
  disabled,
  grow,
  iconOnly,
}: {
  /** Share the row's width with the other actions. */
  grow?: boolean;
  /** A round button with only its icon; the label is for VoiceOver. */
  iconOnly?: boolean;
  icon?: Parameters<typeof Symbol>[0]["name"];
  /** For the one mark SF Symbols does not carry. Given the resolved colour. */
  glyph?: (color: string) => React.ReactNode;
  label: string;
  onPress: () => void;
  busy?: boolean;
  /*
   * Present but unusable, rather than absent.
   *
   * A row of actions that changes length from stop to stop is a row you have
   * to re-read at every card, and a venue with no Instagram is a fact worth
   * showing: it is the difference between "we have not recorded one" and
   * "this app does not do that", which is the same distinction every other
   * unknown in this catalogue is careful about.
   */
  disabled?: boolean;
}) {
  const c = useTheme();
  const tint = disabled ? c.textTertiary : c.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      disabled={busy || disabled}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: iconOnly ? 0 : space.md,
        width: iconOnly ? 40 : undefined,
        flex: grow ? 1 : undefined,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: c.backgroundSelected,
        opacity: pressed ? 0.6 : busy ? 0.5 : disabled ? 0.45 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={c.accent} />
      ) : glyph ? (
        glyph(tint)
      ) : icon ? (
        <Symbol name={icon} size={iconOnly ? 16 : 13} weight="semibold" color={tint} />
      ) : null}
      {iconOnly ? null : (
        <Text variant="subheadline" weight="600" style={{ color: tint }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Uber's name on Uber's black, which is how their own ride buttons read.
 *
 * Their wordmark is a licensed file, not a font; until the official asset is
 * in the app this is the name set in their colours, not an imitation of the
 * mark. Black on every theme, because that is the brand's, not ours.
 */
function UberMark() {
  return (
    <View
      style={{
        backgroundColor: "#000000",
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
      }}
    >
      <Text variant="caption2" weight="700" style={{ color: "#FFFFFF", letterSpacing: -0.2 }}>
        Uber
      </Text>
    </View>
  );
}
