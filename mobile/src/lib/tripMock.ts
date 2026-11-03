import type { SymbolViewProps } from "expo-symbols";

/*
 * Sample trips, to see Trips as it will look once built (owner, 3 Nov 2026:
 * "lets build out the trips side with mock data"). Nothing here is from the
 * catalogue: every price, time and place is a placeholder, and the screens
 * say so. The real engine (the Trips plan, 25 Oct) replaces this file.
 */

export type TravelMode = "bus" | "trotro" | "car" | "flight";

export interface TripRoute {
  mode: TravelMode;
  operator: string;
  from: string;
  departs: string;
  hours: number;
  /** Per person, or per day for a car. */
  fare: number;
  perDay?: boolean;
  note?: string;
}

export interface TripStay {
  name: string;
  kind: string;
  area: string;
  room: string;
  sleeps: number;
  nightly: number;
  breakfast: boolean;
  /** Two colours for the stay's picture, until it has photos. */
  tint: [string, string];
}

export interface TripStop {
  time: string;
  name: string;
  what: string;
  cost: number;
}

export interface Destination {
  id: string;
  name: string;
  region: string;
  blurb: string;
  icon: SymbolViewProps["name"];
  tint: [string, string];
  /** Whether there is enough to plan a whole trip there yet. */
  live: boolean;
  routes: TripRoute[];
  stays: TripStay[];
  days: { title: string; stops: TripStop[] }[];
}

export const DESTINATIONS: Destination[] = [
  {
    id: "cape-coast",
    name: "Cape Coast",
    region: "Central",
    blurb: "Castles, Kakum's canopy walk and long beach evenings.",
    icon: "beach.umbrella.fill",
    tint: ["#E8A33D", "#B5452B"],
    live: true,
    routes: [
      { mode: "bus", operator: "Intercity coach", from: "Accra station, Circle", departs: "7:00 am", hours: 3, fare: 120 },
      { mode: "trotro", operator: "Trotro", from: "Kaneshie station", departs: "When full", hours: 3.5, fare: 70, note: "Leaves when every seat is taken" },
      { mode: "car", operator: "Car with a driver", from: "Picks you up", departs: "When you like", hours: 2.5, fare: 1200, perDay: true },
    ],
    stays: [
      { name: "Sea Breeze Lodge", kind: "Guesthouse", area: "Elmina road", room: "Double room", sleeps: 2, nightly: 650, breakfast: true, tint: ["#2E8B8B", "#174A5A"] },
      { name: "The Castle View", kind: "Hotel", area: "Victoria Park", room: "Deluxe double", sleeps: 2, nightly: 1100, breakfast: true, tint: ["#C77B30", "#5A2E17"] },
      { name: "Palm Grove Cabins", kind: "Eco-lodge", area: "Brenu Beach", room: "Beach cabin", sleeps: 3, nightly: 900, breakfast: false, tint: ["#3E7B46", "#1C3A22"] },
    ],
    days: [
      {
        title: "Arrive and settle in",
        stops: [
          { time: "12:30 pm", name: "Lunch by the water", what: "Grilled fish and kelewele", cost: 260 },
          { time: "3:00 pm", name: "Cape Coast Castle", what: "Guided tour", cost: 200 },
          { time: "7:30 pm", name: "Beach-front dinner", what: "Sunset table for two", cost: 420 },
        ],
      },
      {
        title: "Canopy and coast",
        stops: [
          { time: "8:00 am", name: "Kakum National Park", what: "The canopy walkway", cost: 300 },
          { time: "1:00 pm", name: "Hans Cottage", what: "Lunch beside the crocodile pond", cost: 280 },
          { time: "5:30 pm", name: "Elmina Castle and harbour", what: "The fishing boats coming in", cost: 160 },
        ],
      },
      {
        title: "Slow morning, then home",
        stops: [{ time: "9:00 am", name: "Breakfast at the stay", what: "Then the road back", cost: 0 }],
      },
    ],
  },
  {
    id: "volta",
    name: "Volta",
    region: "Volta and Oti",
    blurb: "Wli Falls, Mount Afadja and the lake at Akosombo.",
    icon: "mountain.2.fill",
    tint: ["#3E9B5F", "#1D4E32"],
    live: true,
    routes: [
      { mode: "bus", operator: "Intercity coach", from: "Accra station, Circle", departs: "6:30 am", hours: 4, fare: 140 },
      { mode: "car", operator: "Car with a driver", from: "Picks you up", departs: "When you like", hours: 3.5, fare: 1400, perDay: true },
    ],
    stays: [
      { name: "Waterfall Lodge", kind: "Lodge", area: "Wli", room: "Garden double", sleeps: 2, nightly: 700, breakfast: true, tint: ["#3E7B46", "#1C3A22"] },
      { name: "Lakeside Retreat", kind: "Resort", area: "Akosombo", room: "Lake-view room", sleeps: 2, nightly: 1300, breakfast: true, tint: ["#2E6E8B", "#173A5A"] },
    ],
    days: [
      { title: "Into the hills", stops: [{ time: "2:00 pm", name: "Wli Falls", what: "The lower falls walk", cost: 150 }, { time: "7:00 pm", name: "Dinner at the lodge", what: "Local and continental", cost: 320 }] },
      { title: "The summit", stops: [{ time: "7:00 am", name: "Mount Afadja", what: "The climb, with a guide", cost: 200 }, { time: "1:30 pm", name: "Tafi Atome", what: "The monkey sanctuary", cost: 120 }] },
    ],
  },
  {
    id: "kumasi",
    name: "Kumasi",
    region: "Ashanti",
    blurb: "Manhyia Palace, Kejetia market and kente weaving at Bonwire.",
    icon: "building.columns.fill",
    tint: ["#D4A72C", "#7A4E12"],
    live: true,
    routes: [
      { mode: "flight", operator: "Domestic flight", from: "Kotoka, Terminal 2", departs: "7:15 am", hours: 1, fare: 900 },
      { mode: "bus", operator: "Intercity coach", from: "Accra station, Circle", departs: "6:00 am", hours: 5, fare: 160 },
      { mode: "car", operator: "Car with a driver", from: "Picks you up", departs: "When you like", hours: 4.5, fare: 1500, perDay: true },
    ],
    stays: [
      { name: "Garden City Suites", kind: "Hotel", area: "Ahodwo", room: "Executive double", sleeps: 2, nightly: 950, breakfast: true, tint: ["#8B5A2E", "#3A2414"] },
      { name: "Adum Guesthouse", kind: "Guesthouse", area: "Adum", room: "Standard double", sleeps: 2, nightly: 480, breakfast: false, tint: ["#6E4E8B", "#2E1D52"] },
    ],
    days: [
      { title: "The city", stops: [{ time: "10:00 am", name: "Manhyia Palace Museum", what: "The Asantehene's palace", cost: 100 }, { time: "1:00 pm", name: "Kejetia market", what: "Lunch and a wander", cost: 150 }] },
      { title: "Weavers", stops: [{ time: "9:00 am", name: "Bonwire", what: "Watch kente being woven", cost: 120 }, { time: "4:00 pm", name: "Lake Bosomtwe", what: "Sunset by the crater lake", cost: 180 }] },
    ],
  },
  {
    id: "busua",
    name: "Busua",
    region: "Western",
    blurb: "Surf lessons, lobster on the sand and quiet coves.",
    icon: "water.waves",
    tint: ["#2E8BB5", "#174A6E"],
    live: false,
    routes: [],
    stays: [],
    days: [],
  },
  {
    id: "mole",
    name: "Mole",
    region: "Savannah",
    blurb: "Elephants at the waterhole, on foot with a ranger.",
    icon: "pawprint.fill",
    tint: ["#B57A2E", "#5A3A17"],
    live: false,
    routes: [],
    stays: [],
    days: [],
  },
];

export const MODE_ICON: Record<TravelMode, SymbolViewProps["name"]> = {
  bus: "bus.fill",
  trotro: "bus",
  car: "car.fill",
  flight: "airplane",
};

/** What the trip comes to: the cheapest way there and back, the stay, and the days. */
export function tripTotal(d: Destination, people: number, nights: number, routeIndex = 0, stayIndex = 0): number {
  const route = d.routes[routeIndex];
  const stay = d.stays[stayIndex];
  const travel = route ? (route.perDay ? route.fare * (nights + 1) : route.fare * people * 2) : 0;
  const rooms = stay ? Math.ceil(people / stay.sleeps) * stay.nightly * nights : 0;
  const days = d.days.reduce((t, day) => t + day.stops.reduce((s, x) => s + x.cost, 0), 0) * (people / 2);
  return Math.round(travel + rooms + days);
}
