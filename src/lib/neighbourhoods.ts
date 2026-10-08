/**
 * Where the neighbourhoods of the cities beyond Accra are, by name.
 *
 * Accra's areas are the catalogue's own: hundreds of venues already say
 * where Osu and Labone are. Elsewhere there are a handful, and Google's
 * address is no help: it files most of south-west Kumasi, Ahodwo included,
 * under "Kwadaso Municipal", so every place added there came out as Kwadaso.
 * Google does know where each neighbourhood is when asked by name, so these
 * centres were taken from it ("Adum, Kumasi, Ghana" and so on) on 8 Oct 2026,
 * and a place is filed under the nearest one.
 *
 * Add a city's list when it gets venues; add a name when somebody points out
 * a neighbourhood that is missing.
 */
export interface Neighbourhood {
  name: string;
  lat: number;
  lng: number;
}

export const NEIGHBOURHOODS: Record<string, Neighbourhood[]> = {
  Kumasi: [
    { name: "Adum", lat: 6.6919, lng: -1.6287 },
    { name: "Asafo", lat: 6.6883, lng: -1.6187 },
    { name: "Bantama", lat: 6.7066, lng: -1.6299 },
    { name: "Manhyia", lat: 6.7053, lng: -1.6142 },
    { name: "Tafo", lat: 6.7447, lng: -1.6044 },
    { name: "Suame", lat: 6.7226, lng: -1.6445 },
    { name: "Ahodwo", lat: 6.6527, lng: -1.6218 },
    { name: "Nhyiaeso", lat: 6.6735, lng: -1.6166 },
    { name: "Danyame", lat: 6.6546, lng: -1.6171 },
    { name: "Asokwa", lat: 6.6701, lng: -1.5878 },
    { name: "Atonsu", lat: 6.6484, lng: -1.6095 },
    { name: "Santasi", lat: 6.6634, lng: -1.6626 },
    { name: "Kwadaso", lat: 6.6905, lng: -1.6494 },
    { name: "Patasi", lat: 6.6818, lng: -1.6441 },
    { name: "Dichemso", lat: 6.7107, lng: -1.6069 },
    { name: "Ayeduase", lat: 6.6745, lng: -1.5425 },
    { name: "Amakom", lat: 6.6798, lng: -1.6039 },
    { name: "Ashtown", lat: 6.7037, lng: -1.6232 },
    { name: "Asawasi", lat: 6.7026, lng: -1.6045 },
    { name: "Kaase", lat: 6.6506, lng: -1.6061 },
    { name: "Buokrom", lat: 6.728, lng: -1.6057 },
    { name: "Sofoline", lat: 6.6486, lng: -1.6172 },
    { name: "South Suntreso", lat: 6.6945, lng: -1.6409 },
    { name: "North Suntreso", lat: 6.7025, lng: -1.6409 },
    { name: "Kronum", lat: 6.748, lng: -1.6506 },
    { name: "Daban", lat: 6.6131, lng: -1.6129 },
    { name: "Atasomanso", lat: 6.6411, lng: -1.6287 },
    { name: "Kenyase", lat: 6.7448, lng: -1.5589 },
    { name: "Emena", lat: 6.6667, lng: -1.5333 },
    { name: "Ejisu", lat: 6.7216, lng: -1.4768 },
  ],
};

/** Within this of a neighbourhood's centre, a place is in it. */
const WITHIN_METRES = 2500;

/** The nearest known neighbourhood of this city to a point, if one is close enough. */
export function nearestNeighbourhood(
  city: string,
  point: { lat: number | null; lng: number | null } | undefined
): { name: string; metres: number } | null {
  const list = NEIGHBOURHOODS[city.trim()] ?? NEIGHBOURHOODS[Object.keys(NEIGHBOURHOODS).find((c) => c.toLowerCase() === city.trim().toLowerCase()) ?? ""];
  if (!list?.length || point?.lat == null || point?.lng == null) return null;
  const { lat, lng } = point as { lat: number; lng: number };
  let best: { name: string; metres: number } | null = null;
  for (const n of list) {
    const metres = Math.round(Math.hypot((n.lat - lat) * 111_320, (n.lng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180)));
    if (!best || metres < best.metres) best = { name: n.name, metres };
  }
  return best && best.metres <= WITHIN_METRES ? best : null;
}
