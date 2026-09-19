import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "../Text";
import { Symbol } from "../Symbol";
import { StopGallery } from "./StopGallery";
import { MenuSheet } from "./MenuSheet";
import { ReportSheet } from "./ReportSheet";
import { HAIRLINE, radius, space } from "../../theme";
import { useTheme } from "../../lib/useTheme";
import { ghs, instagramUrl, time12 } from "../../lib/format";
import type { ItineraryOrder, ItineraryStop } from "../../lib/types";

/**
 * One stop on the timeline: photo, timing, what you are ordering (editable),
 * why it fits, and the actions that only make sense here.
 */
export function StopCard({
  stop,
  index,
  onSwap,
  onOrdersChange,
  onReserve,
  onReported,
  swapping,
  reserving,
}: {
  stop: ItineraryStop;
  index: number;
  onSwap: () => void;
  onOrdersChange: (orders: ItineraryOrder[]) => void;
  onReserve: () => void;
  onReported: (message: string) => void;
  swapping: boolean;
  reserving: boolean;
}) {
  const c = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const editable = stop.kind !== "event";
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
  const canReserve =
    (stop.reservation_required || stop.event?.reservation_required === true) &&
    !stop.reservation_requested;

  /** Quantity stepper. Dropping to zero removes the line entirely. */
  function changeQty(at: number, delta: number) {
    void Haptics.selectionAsync();
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
      <StopGallery images={stop.images ?? (stop.image_url ? [stop.image_url] : [])} alt={stop.name} />

      <View style={{ padding: space.lg, gap: space.sm }}>
        {/* Label + time */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="caption1" tone="tint" weight="700" style={{ letterSpacing: 0.6 }}>
            {stop.label.toUpperCase()}
          </Text>
          <Text variant="caption1" tone="secondary" tabular>
            {stop.arrival_time} · {stop.duration_mins} min
          </Text>
        </View>

        <Text variant="title3">{stop.name}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Symbol name="mappin" size={12} color={c.textSecondary} />
          <Text variant="footnote" tone="secondary">
            {stop.area}
          </Text>
        </View>

        {/*
          Why this stop is here at all. The label above is already the event's
          name, but a name on its own reads like any other heading; this says
          plainly that it is happening on this date and not every night, and
          gives the hour it starts, which is the one thing the arrival time
          cannot tell you.
        */}
        {stop.event ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Symbol name="ticket" size={12} color={c.accent} />
            <Text variant="footnote" tone="tint" weight="600">
              On this date only
              {stop.event.start_time ? ` · starts ${time12(stop.event.start_time)}` : ""}
            </Text>
          </View>
        ) : null}

        {/*
          What the place does every week that is on while you are here.
          
          Under the event badge rather than merged with it: an event is a dated
          one-off the evening was built around, a fixture is a property of the
          place like its opening hours, and a stop can carry both. The wording
          is the server's, so this card and the shared link say the same thing.
        */}
        {(stop.whats_on ?? []).map((line) => (
          <View
            key={line}
            style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
          >
            <Symbol name="music.note" size={12} color={c.textSecondary} />
            <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
              {line}
            </Text>
          </View>
        ))}

        {stop.what_to_do ? (
          <Text variant="subheadline" tone="secondary" style={{ marginTop: space.xs }}>
            {stop.what_to_do}
          </Text>
        ) : null}

        {/* Order lines with steppers */}
        {stop.orders.length > 0 ? (
          <View
            style={{
              marginTop: space.sm,
              borderTopWidth: HAIRLINE,
              borderTopColor: c.border,
              paddingTop: space.sm,
            }}
          >
            {stop.orders.map((o, i) => (
              <View key={`${o.item}-${i}`}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  paddingVertical: 6,
                }}
              >
                {/*
                  Tappable only where there is a note, and it says so with the
                  glyph rather than by being tried. Kitchens name dishes for
                  regulars -- "Chairman", "Jollof Special" -- and the note is
                  the only place the plan can say what one actually is.
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
                    <Symbol
                      name={openNote === i ? "chevron.up.circle" : "info.circle"}
                      size={14}
                      color={c.textTertiary}
                    />
                  </Pressable>
                ) : (
                  <Text variant="subheadline" style={{ flex: 1 }} numberOfLines={2}>
                    {o.item}
                  </Text>
                )}

                {editable ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Pressable
                      onPress={() => changeQty(i, -1)}
                      hitSlop={8}
                      accessibilityLabel={`Remove one ${o.item}`}
                    >
                      <Symbol name="minus.circle" size={22} color={c.textSecondary} />
                    </Pressable>
                    <Text variant="subheadline" tabular weight="600" style={{ minWidth: 16, textAlign: "center" }}>
                      {o.qty}
                    </Text>
                    <Pressable
                      onPress={() => changeQty(i, 1)}
                      hitSlop={8}
                      accessibilityLabel={`Add one ${o.item}`}
                    >
                      <Symbol name="plus.circle" size={22} />
                    </Pressable>
                  </View>
                ) : (
                  <Text variant="subheadline" tone="secondary" tabular>
                    x{o.qty}
                  </Text>
                )}

                <Text variant="subheadline" tabular style={{ minWidth: 74, textAlign: "right" }}>
                  {ghs(o.price_ghs)}
                </Text>
              </View>

              {/*
                The menu's own words, indented under the name they explain and
                never presented as ours. A kitchen that writes "served with
                two sides" is making a promise; we are only repeating it.
              */}
              {openNote === i && o.note ? (
                <Text
                  variant="footnote"
                  tone="secondary"
                  style={{ paddingBottom: 8, paddingRight: 90 }}
                >
                  {o.note}
                </Text>
              ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Stop subtotal */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderTopWidth: HAIRLINE,
            borderTopColor: c.border,
            paddingTop: space.sm,
          }}
        >
          <Text variant="subheadline" tone="secondary">
            Stop total
          </Text>
          <Text variant="subheadline" weight="600" tabular>
            {ghs(stop.est_cost_ghs)}
          </Text>
        </View>

        {/* Why this fits */}
        {stop.why_this_fits ? (
          <View
            style={{
              backgroundColor: c.accentSoft,
              borderRadius: 10,
              padding: space.md,
              marginTop: space.xs,
            }}
          >
            <Text variant="footnote" style={{ color: c.accent }}>
              {stop.why_this_fits}
            </Text>
          </View>
        ) : null}

        {stop.reservation_requested ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xs }}>
            <Symbol name="checkmark.circle.fill" size={14} color={c.success} />
            <Text variant="footnote" tone="green">
              Reservation requested
            </Text>
          </View>
        ) : null}

        {/* Actions */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: space.sm,
            marginTop: space.sm,
            borderTopWidth: HAIRLINE,
            borderTopColor: c.border,
            paddingTop: space.md,
          }}
        >
          <StopAction icon="arrow.triangle.2.circlepath" label="Swap" onPress={onSwap} busy={swapping} />
          {editable ? (
            <StopAction icon="list.bullet" label="Menu" onPress={() => setMenuOpen(true)} />
          ) : null}
          {/*
            Somewhere you do something rather than eat something, so what is on
            offer is a price list of lanes and courts and not a menu. Shown
            from the venue's own type, which the itinerary now carries: the
            card used to know this stop's name, area and price and nothing at
            all about what kind of place it was.
          */}
          {editable && isActivityVenue ? (
            <StopAction
              icon="figure.bowling"
              label="Activity"
              onPress={() => setActivityOpen(true)}
            />
          ) : null}
          <StopAction icon="map" label="Map" onPress={openMaps} />
          {/*
            Always here, greyed when there is nothing to open.
            
            Only twenty-nine of a hundred and eighty-five venues have a handle
            on file, so hiding it would make the action bar a different length
            on most cards, and would say nothing at all about the gap. Greyed
            says "nobody has found one for this place", which is true, and is
            the same thing every other unknown in this catalogue admits to.
          */}
          <StopAction
            glyph={(color) => <InstagramGlyph color={color} />}
            label="Instagram"
            disabled={!instagram}
            onPress={() => instagram && void Linking.openURL(instagram)}
          />
          {canReserve ? (
            <StopAction icon="phone.fill" label="Reserve" onPress={onReserve} busy={reserving} />
          ) : null}
          {/*
            The organiser, on an event that came with a number.

            Labelled "Organiser" and not "Call", because it sits next to
            Reserve and the two reach different people: Reserve is the venue,
            which will still answer next month, and this is whoever is running
            one night. Shown only where there is one, unlike Instagram above,
            because an absent organiser's number is not a gap in our
            catalogue to admit to -- most stops have no event at all.
          */}
          {organiser ? (
            <StopAction
              icon="person.crop.circle.badge.questionmark"
              label="Organiser"
              onPress={() => void Linking.openURL(`tel:${organiser}`)}
            />
          ) : null}
          {/*
            Last, and never the most prominent thing on the card. Someone
            reaches for this once in a hundred stops, but when they do they are
            usually standing in front of the problem.
          */}
          <StopAction
            icon="exclamationmark.bubble"
            label="Report"
            onPress={() => setReportOpen(true)}
          />
        </View>
      </View>

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

function StopAction({
  icon,
  glyph,
  label,
  onPress,
  busy,
  disabled,
}: {
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
        gap: 6,
        paddingHorizontal: space.md,
        height: 32,
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
        <Symbol name={icon} size={13} weight="semibold" color={tint} />
      ) : null}
      <Text variant="footnote" weight="600" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The Instagram mark, drawn.
 *
 * SF Symbols carries no third-party logos and the app ships no icon font, so
 * the alternatives were a bundled PNG that cannot take the theme's colour or
 * three nested Views that can. A rounded square, a circle and a dot is the
 * whole mark, and at thirteen points it is read by shape rather than by
 * detail.
 */
function InstagramGlyph({ color }: { color: string }) {
  const SIZE = 14;
  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: 4.5,
        borderWidth: 1.5,
        borderColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          borderWidth: 1.5,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 1.5,
          right: 1.5,
          width: 1.8,
          height: 1.8,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
