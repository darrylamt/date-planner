"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { VenueResearch } from "@/components/admin/VenueResearch";
import { PlacesLookup } from "@/components/admin/PlacesLookup";
import { bandFromPriceLevel, matchArea, venueTypeFromPlace } from "@/lib/places";
import type { AreaForMatch, PlaceDetails } from "@/lib/places";
import { describeWeek, parsePeriods } from "@/lib/hours";
import { ensureAreaId } from "@/lib/areas";
import type { VenueDraft } from "@/lib/research";
import type { Area, MenuCategory, MenuItem, Venue } from "@/lib/types";

const TYPES = ["restaurant", "activity", "lounge", "outdoor", "cafe", "dessert"] as const;
const BANDS = ["budget", "mid", "premium"] as const;
const VIBES = ["calm", "lively", "romantic", "fun", "adventurous", "scenic", "upscale", "casual"];
const BEST_FOR = ["first_date", "anniversary", "date_night", "friend_outing", "casual_hangout"];
const CATEGORIES: MenuCategory[] = ["starter", "main", "dessert", "drink", "activity", "other"];

type EditableItem = Partial<MenuItem> & { _tmpId: string; _deleted?: boolean };

/** Venue add/edit with inline menu items, built for “add a venue in under 2 minutes”. */
export function VenueForm({
  areas,
  areaCentres,
  venue,
  menuItems,
}: {
  areas: Area[];
  /** Areas with a centre derived from the venues already in them. */
  areaCentres: AreaForMatch[];
  venue: Venue | null;
  menuItems: MenuItem[];
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
      const payload = {
        ...v,
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
        aesthetics: v.aesthetics,
        price_source: v.price_source,
        price_spread: Number(v.price_spread) || 0.3,
        min_party_size: Number(v.min_party_size) || 1,
        // Blank means no practical limit, which is different from zero.
        max_party_size: v.max_party_size === "" ? null : Number(v.max_party_size),
        dress_code: v.dress_code || null,
        instagram_handle: v.instagram_handle || null,
        // Even an admin edit routes through review, so approval happens in
        // exactly one place and is always recorded with who and when.
        phone_pending: v.phone || null,
        phone_status: v.phone ? "pending" : "none",
        phone_source: "admin edit, unreviewed",
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

      for (const item of items) {
        const isNew = item._tmpId.startsWith("new-");
        if (item._deleted) {
          if (!isNew) await supabase.from("menu_items").delete().eq("id", item.id!);
          continue;
        }
        if (!item.name?.trim()) continue;
        const row = {
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
        };
        if (isNew) {
          const { error } = await supabase.from("menu_items").insert(row);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("menu_items").update(row).eq("id", item.id!);
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
          <span className="flbl">Avg cost / person (GHS)</span>
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
            <span className="text-[13px] text-mutedbrown">Least one person can spend, GHS</span>
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
            Saved as a proposal. It stays unusable until approved at{" "}
            <b className="text-ink">Phone review</b>, this number gets dialled
            under our name, so it never goes live on an edit alone.
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
        {/*
          Opening hours: shown, never typed. They come from Google with the
          place link, because a hand-typed copy of somebody else's hours goes
          stale silently and there is no way to tell that it has.
        */}
        <div className="md:col-span-2">
          <span className="flbl">Opening hours</span>
          {parsePeriods(hours.periods) ? (
            <div className="grid gap-x-6 gap-y-1 rounded-bar border border-line bg-cream/50 p-3 text-[13px] sm:grid-cols-2">
              {describeWeek(parsePeriods(hours.periods)).map((d) => (
                <div key={d.day} className="flex justify-between gap-3">
                  <span className="text-mutedbrown">{d.day}</span>
                  <span className={d.hours === "closed" ? "font-semibold text-staletext" : ""}>
                    {d.hours}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-bar border border-line bg-cream/50 p-3 text-[13px] text-mutedbrown">
              No hours on file. Nothing stops a plan sending someone here on a
              day it is closed. Use <b className="text-ink">Find on Google</b>{" "}
              above to fetch them.
            </div>
          )}
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
