"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { ImageField } from "@/components/admin/ImageField";

/**
 * Where the event is, when the event is the only reason the place exists.
 *
 * ── why a planner creates a venue at all ────────────────────────────────
 * The planner engine has one idea of a place: a venue row with an area, so it
 * can be reached, and coordinates, so the fare to the next stop is a real
 * number. A night market on a lawn has to become one of those or it cannot
 * appear in an evening at all. So a location here is an ordinary venue row,
 * and everything downstream -- the map link, the hop cost, the swap, the
 * share page -- works without knowing it was made by a planner.
 *
 * ── it goes live immediately, and that is the whole point ───────────────
 * Nothing reviews this. The verification happened before the account was
 * issued, which is why accounts are handed out one at a time rather than
 * signed up for. An approval queue here would mean a poster going up on
 * Tuesday for an evening that aduro cannot plan until Thursday, which is the
 * same as not being listed.
 *
 * ── what it deliberately does not ask ───────────────────────────────────
 * No price band, no menu, no opening hours. A pop-up has none of those: what
 * it costs is the door price on the event, and when it is open is the event's
 * own start time. Asking would produce answers invented to fill the field.
 */

const TYPES: { value: string; label: string; hint: string }[] = [
  { value: "outdoor", label: "Outdoor", hint: "A lawn, a beach, a car park, a rooftop" },
  { value: "activity", label: "Activity", hint: "A studio, a court, a hall" },
  { value: "lounge", label: "Lounge", hint: "A bar or club taking you for the night" },
  { value: "restaurant", label: "Restaurant", hint: "A kitchen serving your guests" },
  { value: "cafe", label: "Cafe", hint: "Coffee and somewhere to sit" },
  { value: "dessert", label: "Dessert", hint: "Sweet things" },
];

export function LocationsEditor({
  areas,
  locations,
  isFirst,
}: {
  areas: { id: string; name: string }[];
  locations: { id: string; name: string; area: string | null }[];
  isFirst: boolean;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState(isFirst || locations.length === 0);

  const [name, setName] = useState("");
  const [type, setType] = useState("outdoor");
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [image, setImage] = useState("");

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  };

  async function create() {
    if (!name.trim()) return say("Give the place a name.");
    if (!areaId) return say("Choose the part of town it is in.");

    setBusy(true);
    /*
     * No .select() on the insert, and no optimistic row.
     *
     * A planner may insert a venue but has no SELECT grant on most of its
     * columns -- migration 0014 revoked those from `authenticated` outright
     * and 0046 did not give them back, because reading the catalogue is the
     * app's job and not the portal's. Asking for the row back would fail on
     * the read after a write that actually succeeded, which is the most
     * confusing error a form can produce. The page reloads instead.
     */
    const { error } = await supabase.from("venues").insert({
      name: name.trim(),
      type,
      area_id: areaId,
      description: description.trim(),
      google_maps_url: mapsUrl.trim() || null,
      image_url: image.trim() || null,
    });
    setBusy(false);

    if (error) return say(`Could not add that: ${error.message}`);
    // A full reload, because the nav, the venue switcher and the gate all
    // read this from the server and every one of them is now out of date.
    window.location.href = "/venue/whats-on";
  }

  return (
    <div className="grid gap-6">
      {locations.length ? (
        <section className="card p-5">
          <h2 className="mb-1 font-display text-[17px] font-bold">Your locations</h2>
          <p className="mb-4 text-[13px] text-mutedbrown">
            Each one can hold as many events as you run there.
          </p>
          <div className="grid gap-2">
            {locations.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-shell px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink">{l.name}</div>
                  <div className="text-[12.5px] text-mutedbrown">{l.area ?? "No area set"}</div>
                </div>
                <Link
                  href={`/venue/whats-on?venue=${l.id}`}
                  className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[12.5px] text-mutedbrown transition-colors hover:border-flame hover:text-flame"
                >
                  What&apos;s on
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        {!open ? (
          <button className="btn2 btnsm" onClick={() => setOpen(true)}>
            Add another location
          </button>
        ) : (
          <>
            <h2 className="mb-1 font-display text-[17px] font-bold">
              {locations.length ? "Add a location" : "Where is it happening?"}
            </h2>
            <p className="mb-5 text-[13px] text-mutedbrown">
              {locations.length
                ? "Somewhere new you are running something."
                : "Add the place first, then put your event at it. It goes live straight away."}
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col">
                <span className="flbl">What is it called</span>
                <input
                  className="inp"
                  value={name}
                  placeholder="The Lawn at Alliance Française"
                  onChange={(e) => setName(e.target.value)}
                />
                {/* Said here because a planner names a place after the event
                    by instinct, and the name outlives the event. */}
                <span className="mt-1.5 text-[12px] text-mutedbrown">
                  Name the place, not the night. The event gets its own name next.
                </span>
              </label>

              <label className="flex flex-col">
                <span className="flbl">Part of town</span>
                <select className="inp" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {/*
                  Stated plainly, because it is the one answer they cannot
                  change later: 0046 grants area_id on insert and withholds it
                  on update, and 0047 is what actually enforces that -- the
                  grant alone never did, because authenticated holds
                  table-level UPDATE on venues.
                */}
                <span className="mt-1.5 text-[12px] text-mutedbrown">
                  Decides which evenings it can appear in. Ask us if you need it moved.
                </span>
              </label>

              <label className="flex flex-col md:col-span-2">
                <span className="flbl">What kind of place</span>
                <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} — {t.hint}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col md:col-span-2">
                <span className="flbl">Google Maps link</span>
                <input
                  className="inp"
                  value={mapsUrl}
                  placeholder="https://maps.app.goo.gl/…"
                  onChange={(e) => setMapsUrl(e.target.value)}
                />
                {/* The honest version of why this matters. */}
                <span className="mt-1.5 text-[12px] text-mutedbrown">
                  Worth finding. Without it we cannot work out the fare from the last stop, and
                  your location gets left out of evenings that start elsewhere.
                </span>
              </label>

              <label className="flex flex-col md:col-span-2">
                <span className="flbl">In a sentence</span>
                <textarea
                  className="inp min-h-[72px] py-2"
                  value={description}
                  placeholder="An open lawn behind the main building, tables under the trees."
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <div className="md:col-span-2">
                <ImageField
                  label="A picture of the place"
                  value={image}
                  onChange={setImage}
                  folder="venues"
                  hint="Your event's poster goes on the event itself, not here"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              {locations.length ? (
                <button className="btn2 btnsm" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
              ) : null}
              <button className="btn btnsm px-7" onClick={() => void create()} disabled={busy}>
                {busy ? "Adding…" : "Add location"}
              </button>
            </div>
          </>
        )}
      </section>

      {toast && <Toast message={toast} />}
    </div>
  );
}
