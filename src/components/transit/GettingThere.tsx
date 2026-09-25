"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { directionsLink, fareText, uberLink, type CarRental, type TrotroStation, type VenueAccess } from "@/lib/transit";

export interface PlaceOption {
  id: string;
  name: string;
  area: string | null;
  lat: number | null;
  lng: number | null;
}

/* The API's answer, as the page reads it. */
interface ApiStop {
  id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
}
interface ApiLine {
  id: string;
  name: string;
  headsign: string | null;
  headwayMins: number | null;
  status: "unchecked" | "confirmed";
  source: "map_2019" | "manual";
  calledAs: string | null;
  fareMin: number | null;
  fareMax: number | null;
  notes: string | null;
  checkedOn: string | null;
}
type ApiStep =
  | { kind: "walk"; toLabel: string; minutes: number; meters: number }
  | { kind: "ride"; line: ApiLine; board: ApiStop; alight: ApiStop; stopsBetween: number; minutes: number; waitMinutes: number }
  | { kind: "taxi"; fromLabel: string; toLabel: string; minutes: number; costGhs: number; reason: string };
interface ApiOption {
  kind: "trotro" | "trotro+taxi" | "taxi" | "walk";
  steps: ApiStep[];
  minutes: number;
  trotroFareMin: number | null;
  trotroFareMax: number | null;
  taxiGhs: number;
  unchecked: boolean;
}

type Origin =
  | { kind: "none" }
  | { kind: "here"; lat: number; lng: number }
  | { kind: "station"; id: string }
  | { kind: "venue"; id: string };

const pin = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/**
 * One screen: where you are going, and how to get there.
 *
 * Drawn at phone width on purpose. This is the stop card's future "Getting
 * there" section, tried out where it can change daily without a build, so it
 * looks like the thing it will become rather than like a web page.
 */
export function GettingThere({
  notReady,
  places,
  stations,
  access,
  rentals,
  initialVenue,
}: {
  notReady: boolean;
  places: PlaceOption[];
  stations: TrotroStation[];
  access: VenueAccess[];
  rentals: CarRental[];
  initialVenue: string | null;
}) {
  const [venueId, setVenueId] = useState<string>(
    initialVenue && places.some((p) => p.id === initialVenue) ? initialVenue : ""
  );
  const [copied, setCopied] = useState(false);

  const place = places.find((p) => p.id === venueId) ?? null;
  const how = access.find((a) => a.venue_id === venueId) ?? null;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the text is on screen either way */
    }
  }

  return (
    <main className="mx-auto w-full max-w-[480px] px-4 pb-16 pt-6">
      <div className="flex items-center justify-between">
        <Logo size={22} href="/" />
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[12px] font-semibold text-amber-900">
          Preview, not in the app yet
        </span>
      </div>

      <h1 className="mt-6 font-display text-[28px] font-bold leading-tight">Getting there</h1>
      <p className="mt-1 text-[15px] text-mutedbrown">
        What to tell a driver, which trotro to take, and where a taxi takes over.
      </p>

      {notReady ? (
        <div className="card mt-6 p-5 text-[14px]">
          The data for this page is not set up yet. Run migrations <b>0059</b> and <b>0060</b>, then{" "}
          <code>npm run transit:import</code> to load the route map.
        </div>
      ) : null}

      <label className="mt-6 block">
        <span className="flbl">Where are you going?</span>
        <select className="inp h-[46px]" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          <option value="">Choose a place…</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.area ? ` · ${p.area}` : ""}
              {access.some((a) => a.venue_id === p.id && a.landmark) ? "  ✓" : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[12px] text-mutedbrown">✓ means we have written directions for it.</span>
      </label>

      {place ? (
        <>
          <Section title="By taxi, Bolt or Uber" icon="🚕">
            {how?.landmark ? (
              <div className="rounded-xl bg-black/[0.04] p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-mutedbrown">Tell the driver</div>
                <div className="mt-1 text-[18px] font-semibold">{how.landmark}</div>
                <button className="mt-2 text-[14px] font-semibold text-flame" onClick={() => copy(how.landmark!)}>
                  {copied ? "Copied" : "Copy, to paste into Bolt or Yango"}
                </button>
              </div>
            ) : (
              <p className="text-[14px] text-mutedbrown">
                We have not written down a landmark for {place.name} yet. Drivers here go by landmarks rather than
                addresses, so ask the venue for the nearest one if the map pin is not enough.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {place.lat != null && place.lng != null ? (
                <a className="btn btnsm px-5" href={uberLink(place.name, place.lat, place.lng)} target="_blank" rel="noreferrer">
                  Open in Uber
                </a>
              ) : null}
              <a className="btn2 btnsm px-5" href={directionsLink(place.name, place.lat, place.lng)} target="_blank" rel="noreferrer">
                Directions in Google Maps
              </a>
            </div>
          </Section>

          <Section title="By trotro" icon="🚐">
            {place.lat == null ? (
              <p className="text-[14px] text-mutedbrown">
                {place.name} has no map pin yet, so we cannot work out a trotro to it. A taxi or ride app with the
                landmark above is the way.
              </p>
            ) : (
              <TrotroPlanner place={place} places={places} stations={stations} how={how} />
            )}
            <TrotroGuide />
          </Section>
        </>
      ) : null}

      <Section title="Hire a car" icon="🚙">
        {rentals.length === 0 ? (
          <p className="text-[14px] text-mutedbrown">No rental companies listed yet.</p>
        ) : (
          <div className="grid gap-3">
            {rentals.map((r) => {
              const wa = r.whatsapp_phone?.replace(/\D/g, "");
              const rate = fareText(r.day_rate_min_ghs, r.day_rate_max_ghs);
              return (
                <div key={r.id} className="rounded-xl border border-black/10 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <b className="text-[15px]">{r.name}</b>
                    <span className="font-mono text-[13px] text-mutedbrown">{rate ? `${rate} a day` : ""}</span>
                  </div>
                  <div className="mt-1 text-[13px] text-mutedbrown">
                    {[r.with_driver && "With a driver", r.self_drive && "Self-drive", r.areas_served].filter(Boolean).join(" · ")}
                  </div>
                  {r.notes ? <div className="mt-1 text-[13px]">{r.notes}</div> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {wa ? (
                      <a className="btn btnsm px-4" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    ) : null}
                    {r.phone ? (
                      <a className="btn2 btnsm px-4" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>
                        Call
                      </a>
                    ) : null}
                    {r.website ? (
                      <a className="btn2 btnsm px-4" href={r.website} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    ) : null}
                  </div>
                  <Checked date={r.checked_on} />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Required by the map's licence, and fair: this part is their work. */}
      <p className="mt-8 text-[12px] text-mutedbrown">
        Trotro routes from the 2019 Accra route map by OpenStreetMap Ghana and Digital Transport for Africa. Map data ©{" "}
        <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
        , available under the Open Database Licence. Times are estimates and fares are only shown where somebody has
        checked them.
      </p>
    </main>
  );
}

function TrotroPlanner({
  place,
  places,
  stations,
  how,
}: {
  place: PlaceOption;
  places: PlaceOption[];
  stations: TrotroStation[];
  how: VenueAccess | null;
}) {
  const [origin, setOrigin] = useState<Origin>({ kind: "none" });
  const [options, setOptions] = useState<ApiOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new destination is a new question.
  useEffect(() => {
    setOptions(null);
    setError(null);
  }, [place.id]);

  useEffect(() => {
    if (origin.kind === "none") return;
    let active = true;
    const from =
      origin.kind === "here"
        ? { lat: origin.lat, lng: origin.lng, label: "Where you are" }
        : origin.kind === "station"
          ? { stationId: origin.id }
          : { venueId: origin.id };
    setBusy(true);
    setError(null);
    fetch("/api/transit/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: { venueId: place.id } }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data.error ?? "Could not work that out.");
          setOptions(null);
        } else setOptions(data.options as ApiOption[]);
      })
      .catch(() => active && setError("Could not reach the route planner."))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [origin, place.id]);

  function useHere() {
    if (!navigator.geolocation) return setError("This browser cannot share your location.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigin({ kind: "here", lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {
        setBusy(false);
        setError("Location is off. Choose a station or a place instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const pinnedStations = stations.filter((s) => s.lat != null && s.lng != null);
  const originValue =
    origin.kind === "station" ? `s:${origin.id}` : origin.kind === "venue" ? `v:${origin.id}` : origin.kind === "here" ? "here" : "";

  return (
    <>
      <span className="flbl">Where are you starting from?</span>
      <div className="grid gap-2">
        <button className="btn2 btnsm w-full" onClick={useHere} disabled={busy}>
          📍 Use where I am now
        </button>
        <select
          className="inp h-[46px]"
          value={originValue === "here" ? "" : originValue}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setOrigin(v.startsWith("s:") ? { kind: "station", id: v.slice(2) } : { kind: "venue", id: v.slice(2) });
          }}
        >
          <option value="">…or choose a station or a place</option>
          {pinnedStations.length ? (
            <optgroup label="Stations">
              {pinnedStations.map((s) => (
                <option key={s.id} value={`s:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Places">
            {places
              .filter((p) => p.id !== place.id && p.lat != null)
              .map((p) => (
                <option key={p.id} value={`v:${p.id}`}>
                  {p.name}
                  {p.area ? ` · ${p.area}` : ""}
                </option>
              ))}
          </optgroup>
        </select>
        {origin.kind === "here" ? <div className="text-[12px] text-mutedbrown">Starting from your current location.</div> : null}
      </div>

      {busy ? <p className="mt-4 text-[14px] text-mutedbrown">Working out the way…</p> : null}
      {error ? <p className="mt-4 text-[14px] text-staletext">{error}</p> : null}

      {options && !busy
        ? options.map((o, i) => <OptionCard key={i} option={o} how={how} placeName={place.name} />)
        : null}
    </>
  );
}

function OptionCard({ option, how, placeName }: { option: ApiOption; how: VenueAccess | null; placeName: string }) {
  const title =
    option.kind === "walk"
      ? "Walk it"
      : option.kind === "taxi"
        ? "Taxi the whole way"
        : option.kind === "trotro+taxi"
          ? "Trotro, then a taxi"
          : option.steps.filter((s) => s.kind === "ride").length > 1
            ? "Two trotros"
            : "One trotro";
  const fare = fareText(option.trotroFareMin, option.trotroFareMax);
  const cost = [
    option.kind !== "taxi" && option.kind !== "walk" ? (fare ? `trotro ${fare}` : "trotro fare not checked") : null,
    option.taxiGhs ? `taxi about GHS ${option.taxiGhs}` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const lastIsWalk = option.steps[option.steps.length - 1]?.kind === "walk";

  return (
    <div className={`mt-4 rounded-xl border p-4 ${option.kind === "taxi" ? "border-dashed border-black/20" : "border-black/10"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[15px] font-bold">{title}</div>
        <div className="text-right font-mono text-[13px] text-mutedbrown">about {option.minutes} min</div>
      </div>
      {cost ? <div className="mt-0.5 text-[13px] text-mutedbrown">{cost}</div> : null}
      {option.unchecked ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          From the 2019 route map, not checked by us yet. Ask the mate before you board.
        </div>
      ) : null}

      <ol className="mt-3 grid gap-3">
        {option.steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_1fr] gap-2 text-[14px]">
            <span className="text-[18px] leading-6" aria-hidden>
              {s.kind === "walk" ? "🚶" : s.kind === "taxi" ? "🚕" : "🚐"}
            </span>
            <div>
              {s.kind === "walk" ? (
                <>
                  Walk about {s.minutes} min to <b>{s.toLabel}</b>
                  {s.meters ? <span className="text-mutedbrown"> ({s.meters} m)</span> : null}.
                  {i === option.steps.length - 1 && how?.walk_directions ? (
                    <div className="mt-1 text-mutedbrown">{how.walk_directions}</div>
                  ) : null}
                </>
              ) : s.kind === "taxi" ? (
                <>
                  Taxi or Bolt from <b>{s.fromLabel}</b> to <b>{s.toLabel}</b>, about GHS {s.costGhs}, {s.minutes} min.
                  <div className="mt-1 text-[13px] text-mutedbrown">
                    {s.reason === "the whole way"
                      ? "The simplest way, and after dark the safest."
                      : `Trotros do not ${s.reason.startsWith("trotros do not go") ? "go the last stretch" : "run near the start"}.`}
                    {s.toLabel === placeName && how?.landmark ? ` Tell the driver: ${how.landmark}.` : ""}
                  </div>
                </>
              ) : (
                <>
                  At{" "}
                  <a className="font-bold underline decoration-dotted" href={pin(s.board.lat, s.board.lng)} target="_blank" rel="noreferrer">
                    {s.board.label}
                  </a>
                  , take the <b>{s.line.name}</b> trotro
                  {s.line.headsign ? <> towards {s.line.headsign}</> : null}
                  {s.line.calledAs ? (
                    <>
                      . The mate calls <i>&ldquo;{s.line.calledAs}&rdquo;</i>
                    </>
                  ) : null}
                  .
                  <div className="mt-1">
                    Get off at{" "}
                    <a className="font-bold underline decoration-dotted" href={pin(s.alight.lat, s.alight.lng)} target="_blank" rel="noreferrer">
                      {s.alight.label}
                    </a>
                    {s.stopsBetween > 0 ? <span className="text-mutedbrown">, {s.stopsBetween} stops on</span> : null}
                    {lastIsWalk && i === option.steps.length - 2 && how?.drop_point ? (
                      <span>. Tell the mate: {how.drop_point}</span>
                    ) : null}
                    .
                  </div>
                  <div className="mt-1 text-[13px] text-mutedbrown">
                    {[
                      `about ${s.minutes} min on board`,
                      s.line.headwayMins ? `one every ~${s.line.headwayMins} min` : null,
                      fareText(s.line.fareMin, s.line.fareMax),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {s.line.notes ? <div>{s.line.notes}</div> : null}
                  </div>
                  {s.line.status === "confirmed" ? (
                    <div className="mt-1 text-[12px] text-mutedbrown">Checked {s.line.checkedOn ?? ""}</div>
                  ) : null}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="card mt-5 p-5">
      <h2 className="flex items-center gap-2 font-display text-[19px] font-bold">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Checked({ date }: { date: string | null }) {
  return (
    <div className={`mt-1 text-[12px] ${date ? "text-mutedbrown" : "text-staletext"}`}>
      {date ? `Checked ${date}` : "Not checked yet"}
    </div>
  );
}

/**
 * The part that does not go out of date.
 *
 * Routes change and fares follow fuel prices, but how a trotro works has been
 * the same for decades, and it is what nobody explains to a newcomer.
 */
function TrotroGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t border-black/10 pt-4">
      <button className="text-[15px] font-semibold text-flame" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "First time on a trotro?"}
      </button>
      {open ? (
        <ul className="mt-3 grid list-disc gap-2 pl-5 text-[14px]">
          <li>
            A trotro is a shared minibus, the cheapest way round Accra. Each runs a fixed route and stops anywhere along
            the way.
          </li>
          <li>
            At a station they fill up and then leave. The <b>mate</b>, the conductor by the door, calls out where it is
            going. Listen for your stop, or ask him: &ldquo;Are you going to…?&rdquo;
          </li>
          <li>On the road, stand at the roadside and wave one down.</li>
          <li>Pay the mate during the ride. Carry small notes and coins; change sometimes comes a stop or two later.</li>
          <li>
            To get off, say <b>&ldquo;Bus stop&rdquo;</b> clearly, a little before your stop.
          </li>
          <li>Keep your phone and bag close in busy stations. After dark, a taxi or ride app is the safer choice.</li>
          <li>Fares move with fuel prices, so they are shown only with the date somebody last checked them.</li>
        </ul>
      ) : null}
    </div>
  );
}
