"use client";

import { useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import {
  directionsLink,
  fareText,
  findTrips,
  uberLink,
  type CarRental,
  type TrotroRoute,
  type TrotroStation,
  type VenueAccess,
} from "@/lib/transit";

export interface PlaceOption {
  id: string;
  name: string;
  area: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * One screen: where you are going, how to get there three ways.
 *
 * Drawn at phone width on purpose. This is the stop card's future "Getting
 * there" section, being tried out where it can change daily without a build,
 * so it should look like the thing it will become rather than like a web page.
 */
export function GettingThere({
  notReady,
  places,
  stations,
  routes,
  access,
  rentals,
  initialVenue,
}: {
  notReady: boolean;
  places: PlaceOption[];
  stations: TrotroStation[];
  routes: TrotroRoute[];
  access: VenueAccess[];
  rentals: CarRental[];
  initialVenue: string | null;
}) {
  const [venueId, setVenueId] = useState<string>(
    initialVenue && places.some((p) => p.id === initialVenue) ? initialVenue : ""
  );
  const [fromId, setFromId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const station = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const place = places.find((p) => p.id === venueId) ?? null;
  const how = access.find((a) => a.venue_id === venueId) ?? null;
  const drop = how?.station_id ? station.get(how.station_id) ?? null : null;

  const trips = useMemo(
    () => (fromId && drop ? findTrips(routes, fromId, drop.id) : []),
    [routes, fromId, drop]
  );

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
        What to tell a driver, which trotro to take, and who rents cars.
      </p>

      {notReady ? (
        <div className="card mt-6 p-5 text-[14px]">
          The data for this page is not set up yet. Run migration <b>0059_getting_around.sql</b>, then add
          stations and routes in the admin under Getting around.
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        <label className="block">
          <span className="flbl">Where are you going?</span>
          <select className="inp h-[46px]" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">Choose a place…</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.area ? ` · ${p.area}` : ""}
                {access.some((a) => a.venue_id === p.id && (a.landmark || a.station_id)) ? "  ✓" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[12px] text-mutedbrown">✓ means we have directions for it.</span>
        </label>
      </div>

      {place ? (
        <>
          {/* ── by car ─────────────────────────────────────────────── */}
          <Section title="By taxi, Bolt or Uber" icon="🚕">
            {how?.landmark ? (
              <div className="rounded-xl bg-black/[0.04] p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-mutedbrown">
                  Tell the driver
                </div>
                <div className="mt-1 text-[18px] font-semibold">{how.landmark}</div>
                <button className="mt-2 text-[14px] font-semibold text-flame" onClick={() => copy(how.landmark!)}>
                  {copied ? "Copied" : "Copy, to paste into Bolt or Yango"}
                </button>
              </div>
            ) : (
              <p className="text-[14px] text-mutedbrown">
                We have not written down a landmark for {place.name} yet. Drivers here navigate by landmarks
                rather than addresses, so ask the venue for the nearest one if the map pin is not enough.
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
            {place.lat == null ? (
              <p className="mt-2 text-[12px] text-mutedbrown">No map pin for this venue, so Uber cannot be opened with it.</p>
            ) : null}
          </Section>

          {/* ── by trotro ──────────────────────────────────────────── */}
          <Section title="By trotro" icon="🚐">
            {!drop ? (
              <p className="text-[14px] text-mutedbrown">
                We have not worked out the trotro way to {place.name} yet. A taxi or ride app is the safe
                choice until we have.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="flbl">Where are you starting from?</span>
                  <select className="inp h-[46px]" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                    <option value="">Choose the station nearest you…</option>
                    {stations
                      .filter((s) => s.id !== drop.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>

                {!fromId ? null : trips.length === 0 ? (
                  <p className="mt-3 text-[14px] text-mutedbrown">
                    We have not checked a trotro from {station.get(fromId)?.name} to {drop.name} yet, even with a
                    change. We would rather say so than guess.
                  </p>
                ) : (
                  trips.map((trip, t) => (
                    <div key={t} className="mt-4 rounded-xl border border-black/10 p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-[15px] font-bold">
                          {trip.legs.length === 1 ? "One trotro" : `${trip.legs.length} trotros, ${trip.legs.length - 1} change${trip.legs.length > 2 ? "s" : ""}`}
                        </div>
                        <div className="text-right font-mono text-[13px] text-mutedbrown">
                          {[fareText(trip.fareMin, trip.fareMax), trip.minutes ? `~${trip.minutes} min` : null]
                            .filter(Boolean)
                            .join(" · ") || "fare and time not recorded"}
                        </div>
                      </div>
                      <ol className="mt-3 grid gap-3">
                        {trip.legs.map((leg, i) => {
                          const from = station.get(leg.from_station_id);
                          const to = station.get(leg.to_station_id);
                          return (
                            <li key={leg.id} className="grid grid-cols-[24px_1fr] gap-2 text-[14px]">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-flame text-[12px] font-bold text-white">
                                {i + 1}
                              </span>
                              <div>
                                <div>
                                  {i === 0 ? "Go to " : "At "}
                                  <b>{from?.name}</b>
                                  {from?.where_exactly ? <span className="text-mutedbrown">, {from.where_exactly}</span> : null}.
                                </div>
                                <div className="mt-1">
                                  Take the trotro to <b>{to?.name}</b>
                                  {leg.called_as ? (
                                    <>
                                      . The mate calls <i>&ldquo;{leg.called_as}&rdquo;</i>
                                    </>
                                  ) : null}
                                  {leg.board_note ? <span className="text-mutedbrown"> ({leg.board_note})</span> : null}.
                                </div>
                                <div className="mt-1 text-[13px] text-mutedbrown">
                                  {[fareText(leg.fare_min_ghs, leg.fare_max_ghs), leg.minutes ? `about ${leg.minutes} min` : null, leg.runs]
                                    .filter(Boolean)
                                    .join(" · ")}
                                  {leg.notes ? <div>{leg.notes}</div> : null}
                                </div>
                                <Checked date={leg.checked_on} />
                              </div>
                            </li>
                          );
                        })}
                        <li className="grid grid-cols-[24px_1fr] gap-2 text-[14px]">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lagoon text-[12px] font-bold text-white">
                            ✓
                          </span>
                          <div>
                            {how?.drop_point ? (
                              <div>
                                Tell the mate: <b>{how.drop_point}</b>
                              </div>
                            ) : (
                              <div>
                                Get off at <b>{drop.name}</b>.
                              </div>
                            )}
                            {how?.walk_minutes != null || how?.walk_directions ? (
                              <div className="mt-1">
                                {how?.walk_minutes != null ? `Then about ${how.walk_minutes} min on foot` : "Then walk"}
                                {how?.walk_directions ? `: ${how.walk_directions}` : "."}
                              </div>
                            ) : null}
                            <Checked date={how?.checked_on ?? null} />
                          </div>
                        </li>
                      </ol>
                    </div>
                  ))
                )}
              </>
            )}
            <TrotroGuide />
          </Section>
        </>
      ) : null}

      {/* ── rentals ────────────────────────────────────────────────── */}
      <Section title="Hire a car" icon="🚙">
        {rentals.length === 0 ? (
          <p className="text-[14px] text-mutedbrown">No rental companies listed yet.</p>
        ) : (
          <div className="grid gap-3">
            {rentals.map((r) => {
              const wa = r.whatsapp_phone?.replace(/\D/g, "");
              return (
                <div key={r.id} className="rounded-xl border border-black/10 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <b className="text-[15px]">{r.name}</b>
                    <span className="font-mono text-[13px] text-mutedbrown">
                      {fareText(r.day_rate_min_ghs, r.day_rate_max_ghs)
                        ? `${fareText(r.day_rate_min_ghs, r.day_rate_max_ghs)} a day`
                        : ""}
                    </span>
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
    </main>
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
            A trotro is a shared minibus, the cheapest way round Accra. Each runs a fixed route between two
            stations and stops anywhere along the way.
          </li>
          <li>
            At a station they fill up and then leave. The <b>mate</b>, the conductor by the door, calls out
            where it is going. Listen for your stop, or ask him: &ldquo;Are you going to…?&rdquo;
          </li>
          <li>On the road, stand at the roadside and wave one down.</li>
          <li>
            Pay the mate during the ride. Carry small notes and coins; change sometimes comes a stop or two
            later.
          </li>
          <li>
            To get off, say <b>&ldquo;Bus stop&rdquo;</b> clearly, a little before your stop.
          </li>
          <li>
            Keep your phone and bag close in busy stations. After dark, a taxi or ride app is the safer
            choice.
          </li>
          <li>Fares move with fuel prices, so the ones here show the date somebody last checked them.</li>
        </ul>
      ) : null}
    </div>
  );
}
