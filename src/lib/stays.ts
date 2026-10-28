/**
 * Places to stay (0099), as the admin enters them for Trips. Plain values,
 * safe in the browser: the form, the list and the save route share them, and
 * the database checks the same lists.
 */

/** Ghana's sixteen regions, as stay_details.region accepts them. */
export const GHANA_REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Western North", "Central", "Eastern", "Volta", "Oti",
  "Northern", "Savannah", "North East", "Upper East", "Upper West", "Bono", "Bono East", "Ahafo",
] as const;
export type GhanaRegion = (typeof GHANA_REGIONS)[number];

export const STAY_KINDS = [
  { id: "hotel", label: "Hotel" },
  { id: "guesthouse", label: "Guesthouse" },
  { id: "apartment", label: "Apartment" },
  { id: "resort", label: "Resort" },
  { id: "lodge", label: "Lodge" },
  { id: "eco_lodge", label: "Eco-lodge" },
  { id: "hostel", label: "Hostel" },
  { id: "homestay", label: "Homestay" },
  { id: "villa", label: "Villa" },
  { id: "other", label: "Something else" },
] as const;
export type StayKind = (typeof STAY_KINDS)[number]["id"];

export const ROOM_TYPES = [
  { id: "single", label: "Single" },
  { id: "double", label: "Double" },
  { id: "twin", label: "Twin" },
  { id: "triple", label: "Triple" },
  { id: "family", label: "Family" },
  { id: "suite", label: "Suite" },
  { id: "dorm", label: "Dorm bed" },
  { id: "apartment", label: "Whole apartment" },
  { id: "chalet", label: "Chalet" },
  { id: "tent", label: "Tent" },
  { id: "other", label: "Other" },
] as const;
export type RoomType = (typeof ROOM_TYPES)[number]["id"];

/** What a stay has, as a checklist. Backup power matters here more than a gym. */
export const STAY_AMENITIES = [
  { id: "wifi", label: "Wi-Fi" },
  { id: "ac", label: "Air conditioning" },
  { id: "hot_water", label: "Hot water" },
  { id: "backup_power", label: "Backup power" },
  { id: "parking", label: "Parking" },
  { id: "security", label: "24-hour security" },
  { id: "breakfast", label: "Breakfast available" },
  { id: "restaurant", label: "Restaurant" },
  { id: "bar", label: "Bar" },
  { id: "room_service", label: "Room service" },
  { id: "pool", label: "Swimming pool" },
  { id: "beach", label: "Beach access" },
  { id: "garden", label: "Garden" },
  { id: "gym", label: "Gym" },
  { id: "spa", label: "Spa" },
  { id: "kitchen", label: "Kitchen" },
  { id: "laundry", label: "Laundry" },
  { id: "tv", label: "TV" },
  { id: "family", label: "Family rooms" },
  { id: "kids", label: "Kids' play area" },
  { id: "accessible", label: "Step-free access" },
  { id: "airport_pickup", label: "Airport pickup" },
  { id: "meeting_room", label: "Meeting room" },
  { id: "pets", label: "Pets allowed" },
] as const;
export const STAY_AMENITY_IDS = STAY_AMENITIES.map((a) => a.id) as string[];

/** The region of each town the catalogue knows (CITY_CENTRES), for a pin with no address. */
export const REGION_OF_TOWN: Record<string, GhanaRegion> = {
  Accra: "Greater Accra",
  Kasoa: "Central",
  Kumasi: "Ashanti",
  Obuasi: "Ashanti",
  Takoradi: "Western",
  "Cape Coast": "Central",
  Winneba: "Central",
  Tamale: "Northern",
  Koforidua: "Eastern",
  Akosombo: "Eastern",
  Ho: "Volta",
  Wa: "Upper West",
  Sunyani: "Bono",
  Techiman: "Bono East",
  Bolgatanga: "Upper East",
};

/** "Volta Region" in a Google address, as one of ours. */
export function regionFromAddress(parts: string[]): GhanaRegion | null {
  for (const p of parts) {
    const name = p.replace(/\s+Region$/i, "").trim();
    const hit = GHANA_REGIONS.find((r) => r.toLowerCase() === name.toLowerCase());
    if (hit && /region$/i.test(p.trim())) return hit;
  }
  for (const p of parts) {
    const hit = GHANA_REGIONS.find((r) => r.toLowerCase() === p.trim().toLowerCase());
    if (hit) return hit;
  }
  return null;
}
