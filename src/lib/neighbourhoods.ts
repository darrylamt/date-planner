/**
 * Where the neighbourhoods of the towns beyond Accra are, by name.
 *
 * Accra's areas are the catalogue's own: hundreds of venues already say
 * where Osu and Labone are. Elsewhere there are a handful, and Google's
 * address is no help: it files most of south-west Kumasi, Ahodwo included,
 * under "Kwadaso Municipal", so every place added there came out as Kwadaso.
 * Google does know where each neighbourhood is when asked by name, so these
 * centres were taken from it ("Adum, Kumasi, Ghana" and so on) on 8 Oct 2026,
 * and a place is filed under the nearest one. In the smaller towns Google
 * often knows a neighbourhood only through something named after it (Ahoe
 * Community Centre, Adweso Market, Lamashegu Police Station), and those stand
 * in for its centre: close enough to tell one neighbourhood from the next.
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
  "Cape Coast": [
    { name: "Abura", lat: 5.1461, lng: -1.2625 },
    { name: "Kotokuraba", lat: 5.1111, lng: -1.2445 },
    { name: "Bakaano", lat: 5.1032, lng: -1.249 },
    { name: "Ola", lat: 5.1047, lng: -1.272 },
    { name: "Adisadel", lat: 5.121, lng: -1.2647 },
    { name: "Amamoma", lat: 5.108, lng: -1.2963 },
    { name: "Abakam", lat: 5.0988, lng: -1.315 },
    { name: "Kwaprow", lat: 5.1237, lng: -1.3011 },
    { name: "Ekon", lat: 5.1221, lng: -1.2252 },
    { name: "Siwdu", lat: 5.1134, lng: -1.2568 },
    { name: "Efutu", lat: 5.2031, lng: -1.3216 },
    { name: "Mpeasem", lat: 5.1611, lng: -1.2965 },
    { name: "Apewosika", lat: 5.1088, lng: -1.2862 },
    { name: "Duakor", lat: 5.1002, lng: -1.2888 },
    { name: "Elmina", lat: 5.1053, lng: -1.3421 },
    { name: "Ankaful", lat: 5.1544, lng: -1.3225 },
    { name: "Kakumdo", lat: 5.1452, lng: -1.2848 },
    { name: "Nkanfoa", lat: 5.1459, lng: -1.2441 },
    { name: "Akotokyir", lat: 5.1354, lng: -1.2927 },
    { name: "Ayifua", lat: 5.137, lng: -1.2783 },
    { name: "Antem", lat: 5.1152, lng: -1.2571 },
  ],
  "Takoradi": [
    { name: "Market Circle", lat: 4.8989, lng: -1.7597 },
    { name: "Anaji", lat: 4.9314, lng: -1.777 },
    { name: "Airport Ridge", lat: 4.9042, lng: -1.7807 },
    { name: "Beach Road", lat: 4.883, lng: -1.7586 },
    { name: "Chapel Hill", lat: 4.8835, lng: -1.7563 },
    { name: "Effia", lat: 4.9315, lng: -1.7624 },
    { name: "Kwesimintsim", lat: 4.9132, lng: -1.7892 },
    { name: "Fijai", lat: 4.9399, lng: -1.7521 },
    { name: "Tanokrom", lat: 4.9133, lng: -1.7721 },
    { name: "New Takoradi", lat: 4.9082, lng: -1.7454 },
    { name: "Essikado", lat: 4.9472, lng: -1.7137 },
    { name: "Kojokrom", lat: 4.9653, lng: -1.7259 },
    { name: "Mpintsin", lat: 4.9725, lng: -1.7144 },
    { name: "Apremdo", lat: 4.9054, lng: -1.7965 },
    { name: "Adiembra", lat: 4.9367, lng: -1.7332 },
    { name: "Effiakuma", lat: 4.9243, lng: -1.7618 },
    { name: "Nkontompo", lat: 4.9185, lng: -1.7401 },
    { name: "Ketan", lat: 4.952, lng: -1.7305 },
    { name: "Assakae", lat: 4.9314, lng: -1.7965 },
    { name: "Whindo", lat: 4.9339, lng: -1.8136 },
    { name: "Takoradi Harbour", lat: 4.8865, lng: -1.7402 },
    { name: "Ntankoful", lat: 4.947, lng: -1.7697 },
    { name: "Kansaworado", lat: 4.9522, lng: -1.7624 },
  ],
  "Akosombo": [
    { name: "Atimpoku", lat: 6.2031, lng: 0.0817 },
    { name: "Senchi", lat: 6.2195, lng: 0.0893 },
    { name: "Akrade", lat: 6.1936, lng: 0.0731 },
    { name: "Akwamufie", lat: 6.2786, lng: 0.077 },
    { name: "Adjena", lat: 6.365, lng: 0.0584 },
    { name: "Juapong", lat: 6.2553, lng: 0.1343 },
  ],
  "Ho": [
    { name: "Bankoe", lat: 6.6127, lng: 0.4693 },
    { name: "Ho Dome", lat: 6.6074, lng: 0.4751 },
    { name: "Ahoe", lat: 6.6107, lng: 0.4693 },
    { name: "Heve", lat: 6.6031, lng: 0.4708 },
    { name: "Kpodzi", lat: 6.6027, lng: 0.4739 },
    { name: "Hliha", lat: 6.6053, lng: 0.4707 },
    { name: "Housing", lat: 6.6154, lng: 0.4747 },
    { name: "Fiave", lat: 6.6211, lng: 0.4741 },
    { name: "Godokpe", lat: 6.6062, lng: 0.4952 },
    { name: "Sokode", lat: 6.5702, lng: 0.4102 },
    { name: "Klefe", lat: 6.6212, lng: 0.4431 },
    { name: "Kpenoe", lat: 6.6316, lng: 0.511 },
    { name: "Taviefe", lat: 6.6608, lng: 0.4717 },
    { name: "Mawuli Estate", lat: 6.5935, lng: 0.4738 },
  ],
  "Koforidua": [
    { name: "Adweso", lat: 6.0663, lng: -0.2528 },
    { name: "Effiduase", lat: 6.1099, lng: -0.2685 },
    { name: "Asokore", lat: 6.1157, lng: -0.2718 },
    { name: "Oyoko", lat: 6.1374, lng: -0.2878 },
    { name: "Betom", lat: 6.0853, lng: -0.2557 },
    { name: "Srodae", lat: 6.0953, lng: -0.2532 },
    { name: "Old Estate", lat: 6.0911, lng: -0.2718 },
    { name: "Okorase", lat: 6.0456, lng: -0.2628 },
    { name: "Galloway", lat: 6.0766, lng: -0.2654 },
    { name: "Two Streams", lat: 6.0705, lng: -0.2474 },
    { name: "Jumapo", lat: 6.1597, lng: -0.2984 },
    { name: "Densuano", lat: 6.0792, lng: -0.2827 },
    { name: "Ada", lat: 6.1092, lng: -0.246 },
    { name: "Koforidua Zongo", lat: 6.108, lng: -0.2573 },
    { name: "Nkurakan", lat: 6.1288, lng: -0.2127 },
  ],
  "Sunyani": [
    { name: "Penkwase", lat: 7.3576, lng: -2.3246 },
    { name: "Abesim", lat: 7.2866, lng: -2.2778 },
    { name: "Fiapre", lat: 7.3644, lng: -2.3493 },
    { name: "Odumase", lat: 7.3727, lng: -2.3172 },
    { name: "Nkwabeng", lat: 7.3428, lng: -2.3275 },
    { name: "Area 3", lat: 7.3327, lng: -2.3235 },
    { name: "Baakoniaba", lat: 7.3266, lng: -2.3497 },
    { name: "New Dormaa", lat: 7.3445, lng: -2.2991 },
    { name: "Berlin Top", lat: 7.3296, lng: -2.3518 },
    { name: "Nana Bosoma", lat: 7.3356, lng: -2.3195 },
    { name: "Yawhima", lat: 7.3428, lng: -2.2516 },
  ],
  "Tamale": [
    { name: "Kalpohin", lat: 9.417, lng: -0.8252 },
    { name: "Lamashegu", lat: 9.39, lng: -0.8531 },
    { name: "Kakpagyili", lat: 9.3783, lng: -0.8462 },
    { name: "Vittin", lat: 9.3907, lng: -0.811 },
    { name: "Kanvilli", lat: 9.45, lng: -0.85 },
    { name: "Sagnarigu", lat: 9.4139, lng: -0.8669 },
    { name: "Choggu", lat: 9.4318, lng: -0.8607 },
    { name: "Gumani", lat: 9.4516, lng: -0.7673 },
    { name: "Jisonayili", lat: 9.4522, lng: -0.8554 },
    { name: "Nyohini", lat: 9.4013, lng: -0.8602 },
    { name: "Aboabo", lat: 9.4031, lng: -0.8471 },
    { name: "Tishigu", lat: 9.4054, lng: -0.8363 },
    { name: "Changli", lat: 9.3895, lng: -0.8398 },
    { name: "Gumbihini", lat: 9.4205, lng: -0.8473 },
    { name: "Zogbeli", lat: 9.4024, lng: -0.8525 },
    { name: "Fuo", lat: 9.4227, lng: -0.8075 },
    { name: "Kpalsi", lat: 9.4352, lng: -0.8784 },
    { name: "Nyanshegu", lat: 9.4232, lng: -0.8354 },
    { name: "Moshie Zongo", lat: 9.4086, lng: -0.8419 },
    { name: "Dungu", lat: 9.3745, lng: -0.8794 },
  ],
  "Bolgatanga": [
    { name: "Zaare", lat: 10.8163, lng: -0.8641 },
    { name: "Yikene", lat: 10.7992, lng: -0.8821 },
    { name: "Soe", lat: 10.8119, lng: -0.8206 },
    { name: "Atulbabisi", lat: 10.7866, lng: -0.8527 },
    { name: "Bukere", lat: 10.8, lng: -0.8667 },
    { name: "Zuarungu", lat: 10.7961, lng: -0.808 },
    { name: "Sherigu", lat: 10.7731, lng: -0.8595 },
  ],
  "Wa": [
    { name: "Kpaguri", lat: 10.0193, lng: -2.5483 },
    { name: "Kambali", lat: 10.0578, lng: -2.5153 },
    { name: "Konta", lat: 10.0472, lng: -2.4966 },
    { name: "Tendamba", lat: 10.0562, lng: -2.5066 },
    { name: "Sokpayiri", lat: 10.0608, lng: -2.5064 },
    { name: "Xavier", lat: 10.0439, lng: -2.5158 },
    { name: "Danko", lat: 10.031, lng: -2.4715 },
    { name: "Bamahu", lat: 10.0128, lng: -2.4827 },
    { name: "Mangu", lat: 10.0652, lng: -2.5249 },
    { name: "Kperisi", lat: 10.1178, lng: -2.4592 },
    { name: "Jengbeyiri", lat: 10.0636, lng: -2.5029 },
    { name: "Limanyiri", lat: 10.0651, lng: -2.5006 },
  ],
  "Techiman": [
    { name: "Kenten", lat: 7.5983, lng: -1.9473 },
    { name: "Hansua", lat: 7.5557, lng: -1.9368 },
    { name: "Agosa", lat: 7.5702, lng: -2.0163 },
    { name: "Krobo", lat: 7.6001, lng: -1.9922 },
    { name: "Dwomo", lat: 7.5772, lng: -1.9336 },
  ],
  "Obuasi": [
    { name: "Tutuka", lat: 6.1959, lng: -1.6487 },
    { name: "Brahabebome", lat: 6.1973, lng: -1.6366 },
    { name: "Sansu", lat: 6.1533, lng: -1.701 },
    { name: "Anyinam", lat: 6.1859, lng: -1.6821 },
    { name: "Boete", lat: 6.1972, lng: -1.6439 },
    { name: "Mangoase", lat: 6.2038, lng: -1.6803 },
    { name: "Gausu", lat: 6.1989, lng: -1.6888 },
    { name: "Kunka", lat: 6.2125, lng: -1.6893 },
    { name: "Nyameso", lat: 6.2137, lng: -1.6955 },
    { name: "Pomposo", lat: 6.202, lng: -1.6142 },
    { name: "Wawasi", lat: 6.1985, lng: -1.6597 },
    { name: "Akaporiso", lat: 6.2021, lng: -1.6248 },
  ],
  "Kasoa": [
    { name: "Akweley", lat: 5.5442, lng: -0.4847 },
    { name: "Galilea", lat: 5.5727, lng: -0.4117 },
    { name: "Opeikuma", lat: 5.5342, lng: -0.4403 },
    { name: "Lamptey Mills", lat: 5.5676, lng: -0.4221 },
    { name: "Millennium City", lat: 5.4821, lng: -0.4718 },
    { name: "Iron City", lat: 5.5381, lng: -0.433 },
    { name: "Buduburam", lat: 5.5248, lng: -0.4738 },
    { name: "Ofaakor", lat: 5.5892, lng: -0.4495 },
    { name: "Walantu", lat: 5.5307, lng: -0.4269 },
    { name: "Nyanyano", lat: 5.4705, lng: -0.4214 },
    { name: "Kakraba", lat: 5.5052, lng: -0.4161 },
    { name: "Tuba", lat: 5.5467, lng: -0.3822 },
  ],
  "Winneba": [
    { name: "Pomadze", lat: 5.3973, lng: -0.6494 },
    { name: "Sankor", lat: 5.3568, lng: -0.6096 },
    { name: "Winneba Zongo", lat: 5.3482, lng: -0.6253 },
    { name: "Gyahadze", lat: 5.3809, lng: -0.5889 },
    { name: "South Campus", lat: 5.3397, lng: -0.6262 },
    { name: "North Campus", lat: 5.3711, lng: -0.6311 },
    { name: "Akosua Village", lat: 5.3287, lng: -0.6386 },
    { name: "Osubonpanyin", lat: 5.3758, lng: -0.6065 },
    { name: "Kojo Beedu", lat: 5.3558, lng: -0.628 },
  ],
};

/**
 * Every town Duro knows, its centre, and how far out it reaches.
 *
 * Which town a new place belongs to is the nearest of these whose reach it
 * is inside, the smaller towns first, so a place in Kasoa is Kasoa rather
 * than the edge of Accra. Outside every reach it falls back to Accra or
 * Kumasi, whichever is nearer, as before.
 */
export const CITY_CENTRES: Record<string, { lat: number; lng: number; radiusKm: number }> = {
  Accra: { lat: 5.6037, lng: -0.187, radiusKm: 35 },
  Kumasi: { lat: 6.6885, lng: -1.6244, radiusKm: 25 },
  "Cape Coast": { lat: 5.1231, lng: -1.2689, radiusKm: 14 },
  "Takoradi": { lat: 4.9016, lng: -1.7831, radiusKm: 14 },
  "Akosombo": { lat: 6.2668, lng: 0.0443, radiusKm: 12 },
  "Ho": { lat: 6.6101, lng: 0.4785, radiusKm: 10 },
  "Koforidua": { lat: 6.0784, lng: -0.2714, radiusKm: 10 },
  "Sunyani": { lat: 7.3349, lng: -2.3123, radiusKm: 10 },
  "Tamale": { lat: 9.4034, lng: -0.8424, radiusKm: 12 },
  "Bolgatanga": { lat: 10.7875, lng: -0.858, radiusKm: 10 },
  "Wa": { lat: 10.0601, lng: -2.5099, radiusKm: 10 },
  "Techiman": { lat: 7.5909, lng: -1.9344, radiusKm: 10 },
  "Obuasi": { lat: 6.2012, lng: -1.6913, radiusKm: 10 },
  "Kasoa": { lat: 5.5344, lng: -0.4253, radiusKm: 8 },
  "Winneba": { lat: 5.3413, lng: -0.6245, radiusKm: 8 },
};

/** The town a point is in, by the centres above. Null only outside Ghana. */
export function cityAt(point: { lat: number; lng: number }): string | null {
  const inGhana = point.lat >= 4.5 && point.lat <= 11.2 && point.lng >= -3.3 && point.lng <= 1.3;
  if (!inGhana) return null;
  const km = (c: { lat: number; lng: number }) =>
    Math.hypot((c.lat - point.lat) * 111.32, (c.lng - point.lng) * 111.32 * Math.cos((point.lat * Math.PI) / 180));
  // Smaller towns first, by how far they reach, so a satellite town wins over the city next door.
  const inside = Object.entries(CITY_CENTRES)
    .map(([name, c]) => ({ name, d: km(c), r: c.radiusKm }))
    .filter((c) => c.d <= c.r)
    .sort((a, b) => a.r - b.r || a.d - b.d);
  if (inside.length) return inside[0].name;
  return km(CITY_CENTRES.Kumasi) < km(CITY_CENTRES.Accra) ? "Kumasi" : "Accra";
}

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
