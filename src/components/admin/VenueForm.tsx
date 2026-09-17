"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DAY_NAMES as SCHEDULE_DAYS } from "@/lib/schedules";
import { Toast } from "@/components/Toast";
import { VenueResearch } from "@/components/admin/VenueResearch";
import { PlacesLookup } from "@/components/admin/PlacesLookup";
import { bandFromPriceLevel, matchArea, venueTypeFromPlace } from "@/lib/places";
import type { AreaForMatch, PlaceDetails } from "@/lib/places";
import { HoursEditor } from "./HoursEditor";
import { ensureAreaId } from "@/lib/areas";
import { VENUE_VIBE_TAGS } from "@/lib/catalog";
import type { VenueDraft } from "@/lib/research";
import type { Area, MenuCategory, MenuItem, Venue, VenueSchedule } from "@/lib/types";

const TYPES = ["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert"] as const;
const BANDS = ["budget", "mid", "premium"] as const;
// From the catalogue vocabulary, so the checkboxes here cannot fall behind the
// tags the planner knows how to match. This list was missing chill, which 8
// venues already carried, and all six of the tags the plan flow's Beach,
// Dancing, Sporty, Outdoorsy, Artsy and Foodie chips look for.
const VIBES = [...VENUE_VIBE_TAGS];
const BEST_FOR = ["first_date", "anniversary", "date_night", "friend_outing", "casual_hangout"];
const CATEGORIES: MenuCategory[] = ["starter", "main", "dessert", "drink", "activity", "other"];

type EditableItem = Partial<MenuItem> & { _tmpId: string; _deleted?: boolean };

/** Venue add/edit with inline menu items, built for “add a venue in under 2 minutes”. */
interface EditableSchedule {
  _tmpId: string;
  _deleted?: boolean;
  id?: string;
  weekday: number;
  /** "19:00", so the input and the eye agree. Minutes on the way to the database. */
  starts: string;
  ends: string;
  title: string;
  cover_ghs: number | "";
  notes: string;
}

function clockOf(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutesOf(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(1439, h * 60 + m));
}

export function VenueForm({
  areas,
  areaCentres,
  venue,
  menuItems,
  schedules,
}: {
  areas: Area[];
  /** Areas with a centre derived from the venues already in them. */
  areaCentres: AreaForMatch[];
  venue: Venue | null;
  menuItems: MenuItem[];
  /** Weekly fixtures: karaoke on Thursdays, a band on Fridays. */
  schedules: VenueSchedule[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [v, setV] = useState({
    name: venue?.name ?? "",
    type: venue?.type ?? "restaurant",
    area_id: venue?.area_id ?? areas[0]?.id ?? "",
    vibe_tags: venue?.vibe_tags ?? [],
    dress_code: venue?.dress_code ?? "",
    price_band: venue?.price_band ?? "mid",
    avg_cost_per_person_ghs: venue ? Number(venue.avg_cost_per_person_ghs) : 100,
    description: venue?.description ?? "",
    best_for: venue?.best_for ?? [],
    reservation_required: venue?.reservation_required ?? false,
    instagram_handle: venue?.instagram_handle ?? "",
    phone: venue?.phone ?? "",
    google_maps_url: venue?.google_maps_url ?? "",
    image_url: venue?.image_url ?? "",
    is_active: venue?.is_active ?? true,
    is_free: venue?.is_free ?? false,
    cuisines: (venue?.cuisines ?? []).join(", "),
    // Three-valued in the database and three-valued here: "" is nobody has
    // asked, which is not the same as "no".
    has_vegetarian_options:
      venue?.has_vegetarian_options === true
        ? "yes"
        : venue?.has_vegetarian_options === false
          ? "no"
          : "",
    dietary_source: venue?.dietary_source ?? "",
    aesthetics: venue?.aesthetics ?? null,
    price_source: venue?.price_source ?? "menu",
    price_spread: venue?.price_spread != null ? String(venue.price_spread) : "0.3",
    pricing_mode: venue?.pricing_mode ?? "per_person",
    unit_price_ghs: venue?.unit_price_ghs != null ? String(venue.unit_price_ghs) : "",
    min_party_size: venue?.min_party_size ?? 1,
    max_party_size: venue?.max_party_size != null ? String(venue.max_party_size) : "",
    google_place_id: venue?.google_place_id ?? "",
    business_status: venue?.business_status ?? "",
    price_level: venue?.price_level ?? "",
    lat: venue?.lat != null ? String(venue.lat) : "",
    lng: venue?.lng != null ? String(venue.lng) : "",
    minimum_spend_ghs:
      venue?.minimum_spend_ghs != null ? String(venue.minimum_spend_ghs) : "",
    // "" is "not recorded", which is deliberately not the same as "both".
    cuisine: venue?.cuisine ?? "",
  });

  /*
   * Opening hours come from Google and are not hand-edited here, so they live
   * beside the form state rather than in it. Shown, never typed.
   */
  const [hours, setHours] = useState<{
    periods: unknown;
    text: string[] | null;
  }>({
    periods: venue?.opening_periods ?? null,
    text: venue?.opening_hours_text ?? null,
  });

  /** What the area field was filled from, so the form can say rather than just fill. */
  const [areaNote, setAreaNote] = useState<string | null>(null);
  const [areaOptions, setAreaOptions] = useState<{ id: string; name: string; metres: number }[]>([]);
  const [newAreaName, setNewAreaName] = useState<string | null>(null);

  const [items, setItems] = useState<EditableItem[]>(
    menuItems.map((m) => ({ ...m, _tmpId: m.id }))
  );
  /*
   * Weekly fixtures, edited like the menu: rows carry a temporary id until
   * they are saved, and a deleted flag rather than vanishing, so one save can
   * work out what to insert, update and remove.
   */
  const [fixtures, setFixtures] = useState<EditableSchedule[]>(
    schedules.map((f) => ({
      _tmpId: f.id,
      id: f.id,
      weekday: f.weekday,
      starts: clockOf(f.starts_minute),
      ends: clockOf(f.ends_minute),
      title: f.title,
      cover_ghs: f.cover_ghs ?? "",
      notes: f.notes ?? "",
    }))
  );
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], val: string) =>
    list.includes(val) ? list.filter((x) => x !== val) : [...list, val];

  function addItem() {
    setItems((cur) => [
      ...cur,
      {
        _tmpId: `new-${Date.now()}-${cur.length}`,
        name: "",
        // An activity venue is almost never adding a starter.
        category: v.type === "activity" || v.type === "outdoor" ? "activity" : "main",
        price_ghs: 0,
        covers_people: 1,
      },
    ]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      /*
       * Phone is the one field a venue edit may not write, and this payload
       * was writing it twice over.
       *
       * `phone` rode in on the spread below, and the pending trio was reset on
       * every save, so the gate came undone in two directions. Saving a venue
       * whose number was already live re-proposed that same number and dropped
       * it back into the review queue: 20 venues in the catalogue were sitting
       * with an approved number and a digit-identical "pending" copy of it,
       * every one stamped "admin edit, unreviewed", which is what "I approved
       * it and it came back" actually was. And a venue still awaiting review
       * has phone = null, so the box renders empty, and saving it wrote
       * phone = '' with phone_status = 'none', destroying the proposal with
       * nothing to show it had ever been made.
       *
       * So the approved column is never written from here, and a proposal is
       * recorded only when the box holds a number that differs from the one
       * already approved. An unchanged box is not an edit. Clearing the box is
       * not a withdrawal either, because withdrawing a live number is what the
       * Withdraw button on Phone review is for, and doing half of it here
       * would leave the number dialable with no proposal left to review.
       */
      const { phone: typedPhone, ...fields } = v;
      const digitsOf = (n: string | null | undefined) => (n ?? "").replace(/\D/g, "");
      const typed = typedPhone.trim();
      const proposesNewNumber = typed !== "" && digitsOf(typed) !== digitsOf(venue?.phone);

      const payload: Record<string, unknown> = {
        ...fields,
        // The check constraint refuses a free venue that also carries a
        // price, so the flag wins and the figure is zeroed rather than
        // failing the save with a database error nobody can act on.
        avg_cost_per_person_ghs: v.is_free ? 0 : v.avg_cost_per_person_ghs,
        pricing_mode: v.pricing_mode,
        // Null rather than 0: "no unit price" and "costs nothing" are
        // different claims, and the constraint checks for the first.
        unit_price_ghs:
          v.pricing_mode === "per_person" || v.unit_price_ghs === ""
            ? null
            : Number(v.unit_price_ghs),
        /*
         * Comma-separated in the box, an array in the column. Lower-cased on
         * the way in so "Korean" and "korean" are the same kitchen: the search
         * matches on these strings and two spellings would be two cuisines.
         */
        cuisines: v.cuisines
          .split(",")
          .map((x: string) => x.trim().toLowerCase())
          .filter(Boolean),
        aesthetics: v.aesthetics,
        /*
         * The only dietary claim in this catalogue with a person behind it, so
         * it is only ever written from this form and never from a menu. Blank
         * stays null: nobody has asked, which a blank cell must not be allowed
         * to read as "no".
         */
        has_vegetarian_options:
          v.has_vegetarian_options === "yes"
            ? true
            : v.has_vegetarian_options === "no"
              ? false
              : null,
        dietary_source: v.dietary_source.trim() || null,
        dietary_checked_at:
          v.has_vegetarian_options === "" ? null : new Date().toISOString(),
        price_source: v.price_source,
        price_spread: Number(v.price_spread) || 0.3,
        min_party_size: Number(v.min_party_size) || 1,
        // Blank means no practical limit, which is different from zero.
        max_party_size: v.max_party_size === "" ? null : Number(v.max_party_size),
        dress_code: v.dress_code || null,
        instagram_handle: v.instagram_handle || null,
        google_maps_url: v.google_maps_url || null,
        image_url: v.image_url || null,
        lat: v.lat === "" ? null : Number(v.lat),
        lng: v.lng === "" ? null : Number(v.lng),
        // Null, not zero: "no floor" and "the floor is nothing" differ.
        minimum_spend_ghs:
          v.minimum_spend_ghs === "" ? null : Number(v.minimum_spend_ghs),
        cuisine: v.cuisine === "" ? null : v.cuisine,
        opening_periods: hours.periods ?? null,
        opening_hours_text: hours.text ?? null,
        hours_synced_at: hours.periods ? new Date().toISOString() : null,
      };

      // Only an actual change to the number is a proposal. Everything else
      // leaves all four phone columns exactly as review left them.
      if (proposesNewNumber) {
        payload.phone_pending = typed;
        payload.phone_status = "pending";
        payload.phone_source = "admin edit, unreviewed";
      }

      /*
       * A new area gets created here rather than silently dropped. Google put
       * Game It Up at Atomic Junction, which is nowhere near anything already
       * in the catalogue, and the alternative to creating it is filing an
       * arcade in the wrong part of town.
       */
      if (newAreaName && !payload.area_id) {
        const created = await ensureAreaId(supabase, newAreaName);
        if (created) payload.area_id = created.id;
      }

      let venueId = venue?.id;
      if (venueId) {
        const { error } = await supabase.from("venues").update(payload).eq("id", venueId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("venues")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        venueId = data.id;
      }

      /*
       * Three statements, not one per dish.
       *
       * This was a loop with an insert, an update or a delete inside it, so
       * saving a venue cost one round trip per menu item. The Honeysuckle has
       * 182, which is 182 sequential requests before the button stops
       * spinning, and on a connection in Accra that is most of a minute for
       * work the database does in a moment. The rows are sorted into three
       * groups and each group goes in one call.
       */
      const rowFor = (item: EditableItem) => ({
        venue_id: venueId,
        name: item.name,
        category: item.category ?? "other",
        price_ghs: Number(item.price_ghs) || 0,
        notes: item.notes || null,
        covers_people: Math.max(1, Number(item.covers_people) || 1),
        // Null rather than 0 throughout: the planner reads null as "no
        // limit", and a 0 would read as a limit of nobody.
        min_players: item.min_players ?? null,
        max_players: item.max_players ?? null,
        duration_minutes: item.duration_minutes ?? null,
        min_age: item.min_age ?? null,
        requires_gear: item.requires_gear || null,
      });

      const live = items.filter((i) => !i._deleted && i.name?.trim());
      const isNew = (i: EditableItem) => i._tmpId.startsWith("new-");

      const toDelete = items
        .filter((i) => i._deleted && !isNew(i) && i.id)
        .map((i) => i.id!);
      if (toDelete.length) {
        const { error } = await supabase.from("menu_items").delete().in("id", toDelete);
        if (error) throw error;
      }

      const toInsert = live.filter(isNew).map(rowFor);
      if (toInsert.length) {
        const { error } = await supabase.from("menu_items").insert(toInsert);
        if (error) throw error;
      }

      /*
       * Existing rows go back through upsert on the primary key, which is the
       * only way to update many rows with different values in one statement.
       * The id is carried explicitly so nothing is ever inserted as a
       * duplicate of a row that already exists.
       */
      const toUpdate = live
        .filter((i) => !isNew(i) && i.id)
        .map((i) => ({ id: i.id!, ...rowFor(i) }));
      if (toUpdate.length) {
        const { error } = await supabase
          .from("menu_items")
          .upsert(toUpdate, { onConflict: "id" });
        if (error) throw error;
      }

      /*
       * Fixtures, same three-way save. Only reachable on an existing venue:
       * a new one has no id to hang them off until after its own insert.
       */
      if (venueId) {
        const liveF = fixtures.filter((f) => !f._deleted && f.title.trim());
        const newF = (f: EditableSchedule) => f._tmpId.startsWith("new-");

        const rowForF = (f: EditableSchedule) => ({
          venue_id: venueId,
          weekday: f.weekday,
          starts_minute: minutesOf(f.starts),
          ends_minute: minutesOf(f.ends),
          title: f.title.trim(),
          // Blank is not zero: no cover recorded and free at the door are
          // different claims, and only one of them is ours to make.
          cover_ghs: f.cover_ghs === "" ? null : Number(f.cover_ghs),
          notes: f.notes.trim() || null,
          is_active: true,
        });

        const dropF = fixtures.filter((f) => f._deleted && !newF(f) && f.id).map((f) => f.id!);
        if (dropF.length) {
          const { error } = await supabase.from("venue_schedules").delete().in("id", dropF);
          if (error) throw error;
        }

        const addF = liveF.filter(newF).map(rowForF);
        if (addF.length) {
          const { error } = await supabase.from("venue_schedules").insert(addF);
          if (error) throw error;
        }

        const editF = liveF.filter((f) => !newF(f) && f.id).map((f) => ({ id: f.id!, ...rowForF(f) }));
        if (editF.length) {
          const { error } = await supabase
            .from("venue_schedules")
            .upsert(editF, { onConflict: "id" });
          if (error) throw error;
        }
      }

      setToast("Saved");
      setTimeout(() => router.push("/admin"), 700);
      router.refresh();
    } catch (e: any) {
      setError(await explainSaveError(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Postgres names the constraint; a person needs the venue.
   *
   * "duplicate key value violates unique constraint
   * venues_google_place_id_idx" is true and useless: the one thing you want
   * to know is which venue already claims that Google listing, and that takes
   * one more query. Usually the answer is that the same place was added twice
   * under two spellings, and knowing the other name is the whole fix.
   */
  async function explainSaveError(e: any): Promise<string> {
    const message: string = e?.message ?? "Save failed, are you an admin?";
    if (e?.code !== "23505") return message;

    if (/google_place_id/.test(message)) {
      const { data } = await supabase
        .from("venues")
        .select("id, name")
        .eq("google_place_id", v.google_place_id)
        .maybeSingle();
      return data
        ? `${data.name} is already linked to this Google listing. ` +
            `Edit that one instead, or unlink it there first.`
        : "Another venue is already linked to this Google listing.";
    }

    if (/venues_name/.test(message)) return `There is already a venue called ${v.name}.`;
    return message;
  }

  async function remove() {
    if (!venue) return;
    if (!confirm(`Delete ${venue.name} and its menu?`)) return;
    setBusy(true);
    const { error } = await supabase.from("venues").delete().eq("id", venue.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  /**
   * Fill the form from a Google Places result.
   *
   * Only the factual fields, and only ones Google actually returned. The price
   * bucket becomes our price band and stops there: it can say a place is
   * expensive, it cannot say a main course costs GHS 180, and plans are built
   * on the second kind of number.
   */
  function applyPlace(d: PlaceDetails) {
    const mappedType = venueTypeFromPlace(d.primaryType, d.types);
    const band = bandFromPriceLevel(d.priceLevel);

    /*
     * Where in town, which linking to Google used to leave blank.
     *
     * Filling everything else and silently leaving the area on whatever the
     * dropdown happened to show is worse than leaving it all blank: the form
     * looks complete, so nobody checks it, and the venue is filed in the first
     * area alphabetically. The area is what the planner groups stops by and
     * routes taxis between, so a wrong one quietly ruins the itinerary.
     */
    const area = matchArea(d.addressParts, areaCentres, { lat: d.lat, lng: d.lng });
    setAreaOptions(area.alternatives ?? []);
    setNewAreaName(area.isNew ? area.name : null);
    setAreaNote(
      area.reason === "address"
        ? `Area read from the address: ${area.name}.`
        : area.reason === "nearby"
          ? area.alternatives && area.alternatives.length > 1
            ? `Closest to ${area.name}, but ${area.alternatives
                .slice(1)
                .map((a) => a.name)
                .join(" and ")} is about as near. Pick the right one.`
            : `Nearest area is ${area.name}, ${area.metres}m from its other venues.`
          : area.isNew
            ? `No area of ours is close. Google calls this "${area.name}", which will be created when you save.`
            : "Could not work out the area from Google. Pick one."
    );

    setHours({ periods: d.openingPeriods, text: d.openingHours });

    setV((cur) => ({
      ...cur,
      name: d.name || cur.name,
      type: mappedType ?? cur.type,
      price_band: band ?? cur.price_band,
      area_id: area.existingId ?? (area.isNew ? "" : cur.area_id),
      phone: d.phone ?? cur.phone,
      google_maps_url: d.googleMapsUri ?? cur.google_maps_url,
      lat: d.lat != null ? String(d.lat) : cur.lat,
      lng: d.lng != null ? String(d.lng) : cur.lng,
      google_place_id: d.id,
      business_status: d.businessStatus ?? "",
      price_level: d.priceLevel ?? "",
    }));

    const notes: string[] = [];
    if (!d.openingPeriods) {
      notes.push("Google has no opening hours for it, so nothing will stop a plan sending someone when it is shut");
    }
    if (d.businessStatus && d.businessStatus !== "OPERATIONAL") {
      notes.push(`Google says this place is ${d.businessStatus.replace(/_/g, " ").toLowerCase()}`);
    }
    if (!mappedType) notes.push("pick the type yourself, no confident mapping");
    if (d.priceRange) {
      notes.push(
        `Google lists ${d.priceRange.currency} ${d.priceRange.min ?? "?"}-${d.priceRange.max ?? "?"}`
      );
    }
    setToast(
      notes.length ? `Linked, ${notes.join("; ")}.` : "Linked to Google. Check it before saving."
    );
  }

  /**
   * Fill the form from a research draft.
   *
   * Only fields the research actually found are overwritten, a null comes
   * back as "not found", not as "clear what you already typed". The area is
   * resolved to an id and created when it is new, so adding a venue in a
   * neighbourhood we have never listed is not a separate errand.
   */
  async function applyDraft(d: VenueDraft) {
    let areaId = v.area_id;
    let createdArea = false;

    if (d.area_name) {
      const area = await ensureAreaId(supabase, d.area_name);
      if (area) {
        areaId = area.id;
        createdArea = area.created;
      }
    }

    setV((cur) => ({
      ...cur,
      name: d.canonical_name || cur.name,
      type: d.type ?? cur.type,
      area_id: areaId,
      description: d.description || cur.description,
      price_band: d.price_band ?? cur.price_band,
      avg_cost_per_person_ghs: d.avg_cost_per_person_ghs || cur.avg_cost_per_person_ghs,
      is_free: d.is_free || cur.is_free,
      vibe_tags: d.vibe_tags.length ? d.vibe_tags : cur.vibe_tags,
      best_for: d.best_for.length ? d.best_for : cur.best_for,
      reservation_required: d.reservation_required || cur.reservation_required,
      dress_code: d.dress_code ?? cur.dress_code,
      phone: d.phone ?? cur.phone,
      instagram_handle: d.instagram_handle ?? cur.instagram_handle,
      google_maps_url: d.google_maps_url ?? cur.google_maps_url,
      lat: d.lat != null ? String(d.lat) : cur.lat,
      lng: d.lng != null ? String(d.lng) : cur.lng,
    }));

    setToast(
      createdArea
        ? `Filled in, and added ${d.area_name} to your areas. Check it before saving.`
        : "Filled in, check it before saving."
    );
  }

  const field = "flex flex-col";

  return (
    <div className="max-w-[760px]">
      <h1 className="font-display text-[24px] font-bold">
        {venue ? `Edit, ${venue.name}` : "Add venue"}
      </h1>

      {venue ? (
        <p className="mt-3 text-[13px] text-mutedbrown">
          Adding a whole menu? <a className="underline" href="/admin/import">Import CSV</a>{" "}
          takes columns <code>venue,name,category,price_ghs,notes</code> and matches
          this venue by name.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        <PlacesLookup
          initialName={v.name}
          linkedPlaceId={v.google_place_id || null}
          onApply={applyPlace}
        />
        <VenueResearch initialName={v.name} onApply={applyDraft} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className={field}>
          <span className="flbl">Name</span>
          <input className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </div>
        <div className={field}>
          <span className="flbl">Area</span>
          <select
            className="inp"
            value={v.area_id}
            onChange={(e) => {
              setV({ ...v, area_id: e.target.value });
              // Choosing an existing area cancels the pending new one.
              if (e.target.value) setNewAreaName(null);
            }}
          >
            {/* Only present while an area is about to be created, so the
                normal case is not cluttered by a blank row. */}
            {newAreaName && !v.area_id ? (
              <option value="">Create &ldquo;{newAreaName}&rdquo;</option>
            ) : null}
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {newAreaName && !v.area_id ? (
            <input
              className="inp mt-2"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="Name for the new area"
            />
          ) : null}

          {/* Two areas can be equally near, and saying so beats picking one
              and looking certain. */}
          {areaOptions.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {areaOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`chip !px-3 !py-1.5 !text-[13px] ${v.area_id === o.id ? "chip-on" : ""}`}
                  onClick={() => {
                    setV({ ...v, area_id: o.id });
                    setNewAreaName(null);
                  }}
                >
                  {o.name} · {o.metres}m
                </button>
              ))}
            </div>
          ) : null}

          {areaNote ? (
            <span className="mt-1 text-[12.5px] text-mutedbrown">{areaNote}</span>
          ) : null}
        </div>
        <div className={field}>
          <span className="flbl">Cuisine</span>
          <select
            className="inp"
            value={v.cuisine}
            onChange={(e) => setV({ ...v, cuisine: e.target.value })}
          >
            <option value="">Not recorded</option>
            <option value="local">Local, Ghanaian and West African</option>
            <option value="continental">Continental, everything else</option>
            <option value="both">Both, genuinely</option>
          </select>
          <span className="mt-1 text-[12px] text-mutedbrown">
            Someone who asks for local food should not be sent for pasta. Leave
            it unrecorded rather than guessing: unrecorded venues are still
            offered, just not preferred, while a wrong answer sends people to
            the wrong kitchen.
          </span>
        </div>
        <div className={field}>
          <span className="flbl">Type</span>
          <select
            className="inp"
            value={v.type}
            onChange={(e) => setV({ ...v, type: e.target.value as (typeof TYPES)[number] })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className={field}>
          <span className="flbl">Price band</span>
          <select
            className="inp"
            value={v.price_band}
            onChange={(e) => setV({ ...v, price_band: e.target.value as (typeof BANDS)[number] })}
          >
            {BANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className={field}>
          {/*
            The same words the Unpriced queue uses. It said "what one person
            pays" there and "avg cost / person" here, for one column, and the
            two readings sounded like two different numbers.
          */}
          <span className="flbl">Cost per person (GHS)</span>
          <input
            className="inp font-mono"
            type="number"
            disabled={v.is_free}
            value={v.is_free ? 0 : v.avg_cost_per_person_ghs}
            onChange={(e) => setV({ ...v, avg_cost_per_person_ghs: Number(e.target.value) })}
          />
          <label className="mt-2 flex items-center gap-2 text-[13px] text-mutedbrown">
            <input
              type="checkbox"
              checked={v.is_free}
              onChange={(e) => setV({ ...v, is_free: e.target.checked })}
            />
            Free to enter
          </label>
          <span className="mt-1 text-[12px] text-mutedbrown">
            {v.is_free
              ? "Only for places that genuinely charge nothing."
              : "Leave at 0 if unknown, unpriced venues are withheld, not shown as free."}
          </span>
        </div>
        <div className={field}>
          <span className="flbl">How sure is the price?</span>
          <select
            className="inp"
            value={v.price_source}
            onChange={(e) => setV({ ...v, price_source: e.target.value as typeof v.price_source })}
          >
            <option value="menu">Read from a menu or a stated rate</option>
            <option value="estimated">An estimate</option>
            <option value="unknown">No idea yet</option>
          </select>
          {v.price_source === "estimated" ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[13px] text-mutedbrown">give or take</span>
              <select
                className="inp max-w-[110px]"
                value={v.price_spread}
                onChange={(e) => setV({ ...v, price_spread: e.target.value })}
              >
                <option value="0.15">15%</option>
                <option value="0.3">30%</option>
                <option value="0.5">50%</option>
              </select>
            </div>
          ) : null}
          <span className="mt-1 block text-[12px] text-mutedbrown">
            {v.price_source === "menu"
              ? "Plans using only these can promise an exact total."
              : v.price_source === "estimated"
                ? "Shown to users as a range, never as an exact figure."
                : "Withheld from planning until somebody puts a number to it."}
          </span>
        </div>

        <div className="md:col-span-2">
          <span className="flbl">How does it charge?</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="inp max-w-[280px]"
              value={v.pricing_mode}
              onChange={(e) => setV({ ...v, pricing_mode: e.target.value as typeof v.pricing_mode })}
            >
              <option value="per_person">Per person (menu or cover)</option>
              <option value="per_hour">Per hour, shared by the group</option>
              <option value="per_group">Flat, shared by the group</option>
              <option value="per_hour_per_person">Per hour, each person</option>
            </select>
            {v.pricing_mode !== "per_person" ? (
              <>
                <span className="text-[13px] text-mutedbrown">GHS</span>
                <input
                  className="inp max-w-[140px] font-mono"
                  type="number"
                  min={0}
                  value={v.unit_price_ghs}
                  onChange={(e) => setV({ ...v, unit_price_ghs: e.target.value })}
                />
                <span className="text-[13px] text-mutedbrown">
                  {v.pricing_mode === "per_group" ? "in total" : "per hour"}
                </span>
              </>
            ) : null}
          </div>
          <span className="mt-1 block text-[12px] text-mutedbrown">
            {v.pricing_mode === "per_person"
              ? "From the menu, or the average above."
              : "One bill, split by however many go."}
          </span>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-mutedbrown">Minimum spend, GHS (rare)</span>
            <input
              className="inp h-[38px] max-w-[120px] font-mono"
              type="number"
              min={0}
              value={v.minimum_spend_ghs}
              onChange={(e) => setV({ ...v, minimum_spend_ghs: e.target.value })}
              placeholder="none"
            />
          </div>
          <span className="mt-1 block text-[12px] text-mutedbrown">
            Leave blank unless the venue really has a floor. Bliss sells arcade
            play only as a GHS 100 bag of ten tokens, so quoting its GHS 10
            single token would be a price the counter will not honour.
          </span>
        </div>
        <div className={field}>
          <span className="flbl">How does it look?</span>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setV({ ...v, aesthetics: v.aesthetics === n ? null : n })}
                className={`text-[22px] leading-none transition ${
                  (v.aesthetics ?? 0) >= n ? "text-flame" : "text-line hover:text-mutedbrown"
                }`}
              >
                ★
              </button>
            ))}
            {v.aesthetics ? (
              <button
                type="button"
                className="ml-2 text-[12px] text-mutedbrown underline"
                onClick={() => setV({ ...v, aesthetics: null })}
              >
                clear
              </button>
            ) : null}
          </div>
          <span className="mt-1 text-[12px] text-mutedbrown">
            {v.aesthetics === 5
              ? "Somewhere worth photographing."
              : v.aesthetics === 1
                ? "The food has to carry this one alone."
                : "5 is beautiful, 1 is grim. Leave blank if you have not seen it, blank is not the same as average."}
          </span>
        </div>
        <div className={field}>
          <span className="flbl">Works for how many?</span>
          <div className="flex items-center gap-2">
            <input
              className="inp font-mono"
              type="number"
              min={1}
              value={v.min_party_size}
              onChange={(e) => setV({ ...v, min_party_size: Number(e.target.value) })}
            />
            <span className="text-[13px] text-mutedbrown">to</span>
            <input
              className="inp font-mono"
              type="number"
              min={1}
              placeholder="any"
              value={v.max_party_size}
              onChange={(e) => setV({ ...v, max_party_size: e.target.value })}
            />
          </div>
          <span className="mt-1 text-[12px] text-mutedbrown">
            Blank for no limit. A padel court is 2 to 4.
          </span>
        </div>
        <div className={field}>
          <span className="flbl">Dress code (optional)</span>
          <input
            className="inp"
            value={v.dress_code}
            onChange={(e) => setV({ ...v, dress_code: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <span className="flbl">Description</span>
          <textarea
            className="ta"
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <span className="flbl">Vibe tags</span>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip px-3.5 py-2 text-[14px] ${v.vibe_tags.includes(t) ? "chip-on" : ""}`}
                onClick={() => setV({ ...v, vibe_tags: toggle(v.vibe_tags, t) })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <span className="flbl">Best for</span>
          <div className="flex flex-wrap gap-2">
            {BEST_FOR.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip px-3.5 py-2 text-[14px] ${v.best_for.includes(t) ? "chip-on" : ""}`}
                onClick={() => setV({ ...v, best_for: toggle(v.best_for, t) })}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        <div className={field}>
          <span className="flbl">Instagram</span>
          <input
            className="inp"
            placeholder="@handle"
            value={v.instagram_handle}
            onChange={(e) => setV({ ...v, instagram_handle: e.target.value })}
          />
        </div>
        <div className={field}>
          <span className="flbl">Phone</span>
          <input className="inp" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <div className="mt-1 text-[12.5px] text-mutedbrown">
            Shows the approved number. Type a different one and it is saved as a
            proposal, unusable until approved at{" "}
            <b className="text-ink">Phone review</b>, because this number gets
            dialled under our name. Leaving it untouched changes nothing, and
            emptying it does not withdraw a live number, that is the{" "}
            <b className="text-ink">Withdraw</b> button on Phone review.
          </div>
        </div>
        <div className={field}>
          <span className="flbl">Google Maps URL</span>
          <input
            className="inp"
            value={v.google_maps_url}
            onChange={(e) => setV({ ...v, google_maps_url: e.target.value })}
          />
        </div>
        <div className={field}>
          <span className="flbl">Image URL</span>
          <input
            className="inp"
            value={v.image_url}
            onChange={(e) => setV({ ...v, image_url: e.target.value })}
          />
        </div>
        <div className={field}>
          <span className="flbl">Latitude</span>
          <input className="inp font-mono" value={v.lat} onChange={(e) => setV({ ...v, lat: e.target.value })} />
        </div>
        <div className={field}>
          <span className="flbl">Longitude</span>
          <input className="inp font-mono" value={v.lng} onChange={(e) => setV({ ...v, lng: e.target.value })} />
        </div>
        <HoursEditor
          raw={hours.periods}
          onChange={(periods) =>
            /*
             * Hand-edited hours drop the weekday text that came from Google
             * alongside them. That text is Google's rendering of Google's
             * periods; keeping it next to hours somebody has since changed
             * would leave two answers on the row, one of them quietly wrong.
             */
            setHours({ periods, text: null })
          }
        />

        {/*
          Asked of the venue, not read off the menu.
          *
          * There is deliberately no allergen field anywhere in this schema: a
          * blank one reads as "no allergens" to whoever is scanning it, and it
          * would have to be filled by guessing from dish names. This is the
          * one dietary claim allowed to be a yes or a no, and only because a
          * person rang and asked. Leave it blank until somebody has.
        */}
        <div className="md:col-span-2">
          <label className="mb-1 block text-[13px] font-bold uppercase tracking-wide text-mutedbrown">
            Kitchen
          </label>
          <input
            className="inp"
            placeholder="italian, seafood"
            value={v.cuisines}
            onChange={(e) => setV({ ...v, cuisines: e.target.value })}
          />
          <span className="mt-1 block text-[12px] text-mutedbrown">
            Comma separated, and only what the place actually is. This is how somebody asking for
            Korean food finds it; the Local/Continental field above stays as it is, because that is
            the one the planner uses. Leaving it blank means nobody has recorded a kitchen, which
            is not the same as the food being from nowhere.
          </span>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-[13px] font-bold uppercase tracking-wide text-mutedbrown">
            Vegetarian options
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-md border border-line px-2 py-1.5 text-[15px]"
              value={v.has_vegetarian_options}
              onChange={(e) => setV({ ...v, has_vegetarian_options: e.target.value })}
            >
              <option value="">Nobody has asked</option>
              <option value="yes">Yes, they have some</option>
              <option value="no">No, they do not</option>
            </select>
            <input
              className="min-w-[240px] flex-1 rounded-md border border-line px-2 py-1.5 text-[15px]"
              placeholder="Who said so, and when. e.g. phoned the manager, 12 Sep"
              value={v.dietary_source}
              onChange={(e) => setV({ ...v, dietary_source: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-6 md:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
            <input
              type="checkbox"
              checked={v.reservation_required}
              onChange={(e) => setV({ ...v, reservation_required: e.target.checked })}
            />
            Reservation required
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
            <input
              type="checkbox"
              checked={v.is_active}
              onChange={(e) => setV({ ...v, is_active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </div>

      {/* Weekly fixtures */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-[18px] font-bold">What is on, weekly</h2>
        <button
          className="btn2 btnsm"
          onClick={() =>
            setFixtures((cur) => [
              ...cur,
              {
                _tmpId: `new-${Date.now()}-${cur.length}`,
                // Thursday, because that is when this sort of thing usually is,
                // and a sensible default is one field nobody has to touch.
                weekday: 4,
                starts: "19:00",
                ends: "22:00",
                title: "",
                cover_ghs: "",
                notes: "",
              },
            ])
          }
        >
          + Add fixture
        </button>
      </div>
      <p className="mt-1 text-[13px] text-mutedbrown">
        Things that happen every week: karaoke on Thursdays, a live band on Fridays. A one-off on
        a particular date is an event, not a fixture. An end time at or before the start means it
        runs past midnight.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>What</th>
              <th>Day</th>
              <th>From</th>
              <th>To</th>
              <th className="whitespace-nowrap">Cover (GHS)</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fixtures.filter((f) => !f._deleted).length === 0 && (
              <tr>
                <td colSpan={7} className="text-[14px] text-mutedbrown">
                  Nothing recorded. Most venues have none, and an empty list means exactly that.
                </td>
              </tr>
            )}
            {fixtures.map((f, i) =>
              f._deleted ? null : (
                <tr key={f._tmpId}>
                  <td>
                    <input
                      className="w-full"
                      placeholder="Karaoke"
                      value={f.title}
                      onChange={(e) =>
                        setFixtures((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x))
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={f.weekday}
                      onChange={(e) =>
                        setFixtures((cur) =>
                          cur.map((x, j) =>
                            j === i ? { ...x, weekday: Number(e.target.value) } : x
                          )
                        )
                      }
                    >
                      {SCHEDULE_DAYS.map((d, idx) => (
                        <option key={d} value={idx}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      value={f.starts}
                      onChange={(e) =>
                        setFixtures((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, starts: e.target.value } : x))
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={f.ends}
                      onChange={(e) =>
                        setFixtures((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, ends: e.target.value } : x))
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      placeholder="none"
                      value={f.cover_ghs}
                      onChange={(e) =>
                        setFixtures((cur) =>
                          cur.map((x, j) =>
                            j === i
                              ? { ...x, cover_ghs: e.target.value === "" ? "" : Number(e.target.value) }
                              : x
                          )
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="w-full"
                      value={f.notes}
                      onChange={(e) =>
                        setFixtures((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x))
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="btn2 btnsm"
                      onClick={() =>
                        setFixtures((cur) =>
                          cur.map((x, j) => (j === i ? { ...x, _deleted: true } : x))
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Menu items */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-[18px] font-bold">Menu items</h2>
        <button className="btn2 btnsm" onClick={addItem}>
          + Add item
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Price (GHS)</th>
              <th className="whitespace-nowrap">Covers</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.filter((i) => !i._deleted).map((item) => (
              <tr key={item._tmpId}>
                <td>
                  <input
                    className="inp h-[38px]"
                    value={item.name ?? ""}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) => (x._tmpId === item._tmpId ? { ...x, name: e.target.value } : x))
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    className="inp h-[38px] w-[110px]"
                    value={item.category ?? "other"}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) =>
                          x._tmpId === item._tmpId
                            ? { ...x, category: e.target.value as MenuCategory }
                            : x
                        )
                      )
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="pinp"
                    type="number"
                    value={item.price_ghs ?? 0}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) =>
                          x._tmpId === item._tmpId ? { ...x, price_ghs: Number(e.target.value) } : x
                        )
                      )
                    }
                  />
                </td>
                <td>
                  {/*
                    How many people this one price covers. A plate of food is
                    1; a foosball table sold as a table with two people at it
                    is 2, and billing that per head charges a couple double.
                  */}
                  <input
                    className="pinp !w-[64px]"
                    type="number"
                    min={1}
                    max={50}
                    value={item.covers_people ?? 1}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) =>
                          x._tmpId === item._tmpId
                            ? { ...x, covers_people: Math.max(1, Number(e.target.value) || 1) }
                            : x
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className="inp h-[38px]"
                    value={item.notes ?? ""}
                    onChange={(e) =>
                      setItems((cur) =>
                        cur.map((x) => (x._tmpId === item._tmpId ? { ...x, notes: e.target.value } : x))
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    className="font-semibold text-staletext hover:underline"
                    onClick={() =>
                      setItems((cur) =>
                        cur.map((x) => (x._tmpId === item._tmpId ? { ...x, _deleted: true } : x))
                      )
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {/*
              The rest of what an activity line needs, on its own row and only
              for activities. A menu does not have a minimum number of players
              and a bowling lane does, so putting these on every row would bury
              six blank boxes under every plate of jollof.
            */}
            {items
              .filter((i) => !i._deleted && i.category === "activity")
              .map((item) => (
                <tr key={`${item._tmpId}-detail`} className="bg-cream/40">
                  <td colSpan={6}>
                    <div className="flex flex-wrap items-end gap-3 px-1 py-1">
                      <span className="text-[12.5px] font-semibold text-mutedbrown">
                        {item.name || "This activity"}:
                      </span>
                      <ActivityNumber
                        label="Min players"
                        value={item.min_players}
                        onChange={(n) =>
                          setItems((cur) =>
                            cur.map((x) =>
                              x._tmpId === item._tmpId ? { ...x, min_players: n } : x
                            )
                          )
                        }
                      />
                      <ActivityNumber
                        label="Max players"
                        value={item.max_players}
                        onChange={(n) =>
                          setItems((cur) =>
                            cur.map((x) =>
                              x._tmpId === item._tmpId ? { ...x, max_players: n } : x
                            )
                          )
                        }
                      />
                      <ActivityNumber
                        label="Minutes"
                        value={item.duration_minutes}
                        onChange={(n) =>
                          setItems((cur) =>
                            cur.map((x) =>
                              x._tmpId === item._tmpId ? { ...x, duration_minutes: n } : x
                            )
                          )
                        }
                      />
                      <ActivityNumber
                        label="Min age"
                        value={item.min_age}
                        onChange={(n) =>
                          setItems((cur) =>
                            cur.map((x) =>
                              x._tmpId === item._tmpId ? { ...x, min_age: n } : x
                            )
                          )
                        }
                      />
                      <label className="flex flex-1 flex-col">
                        <span className="text-[11.5px] font-semibold text-mutedbrown">
                          Must bring
                        </span>
                        <input
                          className="inp h-[34px] min-w-[180px] text-[13px]"
                          value={item.requires_gear ?? ""}
                          placeholder="Socks and bowling shoes"
                          onChange={(e) =>
                            setItems((cur) =>
                              cur.map((x) =>
                                x._tmpId === item._tmpId
                                  ? { ...x, requires_gear: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {error && <div className="why mt-4 not-italic text-staletext">{error}</div>}

      <div className="mt-6 flex gap-3">
        <button className="btn btnsm px-8" onClick={save} disabled={busy || !v.name.trim()}>
          {busy ? "Saving…" : "Save venue"}
        </button>
        {venue && (
          <button className="btn2 btnsm !text-staletext" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}

/**
 * A small optional number.
 *
 * Blank has to stay blank rather than becoming 0, because "no minimum" and "a
 * minimum of nobody" are different claims and the second one is nonsense. The
 * planner reads null as no limit; a 0 would read as a limit of zero.
 */
function ActivityNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (n: number | null) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[11.5px] font-semibold text-mutedbrown">{label}</span>
      <input
        className="inp h-[34px] w-[86px] font-mono text-[13px]"
        type="number"
        min={0}
        value={value ?? ""}
        placeholder="any"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </label>
  );
}
