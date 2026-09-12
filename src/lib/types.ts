/* Shared domain types for aduro. */

export type VenueType = "restaurant" | "activity" | "lounge" | "outdoor" | "cafe" | "dessert";
export type PriceBand = "budget" | "mid" | "premium";
/**
 * "activity" is a line on a price list rather than a course: a go-kart, a game
 * of bowling, twelve minutes of laser tag. Kept apart from "other", which the
 * planner already uses for a flat entry fee.
 */
export type MenuCategory = "starter" | "main" | "dessert" | "drink" | "activity" | "other";

export interface Area {
  id: string;
  name: string;
  city: string;
}

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  area_id: string;
  vibe_tags: string[];
  dress_code: string | null;
  price_band: PriceBand;
  avg_cost_per_person_ghs: number;
  description: string;
  best_for: string[];
  reservation_required: boolean;
  instagram_handle: string | null;
  phone: string | null;
  google_maps_url: string | null;
  image_url: string | null;
  is_active: boolean;
  /**
   * Entry genuinely costs nothing, a park, a beach, a free gallery.
   *
   * Distinct from "we do not know what it costs": an unpriced venue is
   * withheld from plans rather than shown as free, so only this flag lets a
   * stop legitimately total zero.
   */
  is_free: boolean;
  /**
   * How many people the venue works for. A padel court is 2-4; one person
   * cannot use it at all, and the planner has to know that before offering it.
   */
  min_party_size: number;
  max_party_size: number | null;
  /**
   * How the venue charges. A court or a lane is priced per hour however many
   * people turn up, so the bill is split rather than multiplied.
   */
  pricing_mode: "per_person" | "per_group" | "per_hour" | "per_hour_per_person";
  unit_price_ghs: number | null;
  /**
   * The least one person can spend and actually do anything here.
   *
   * Bliss sells arcade play only as a GHS 100 bag of ten tokens, so the median
   * of its GHS 10 to 50 games is a figure nobody can pay at the counter.
   */
  minimum_spend_ghs?: number | null;
  /**
   * local, continental, or both. Null means nobody has recorded it, which is
   * deliberately not the same as both and is never read as either.
   */
  cuisine?: "local" | "continental" | "both" | null;
  /**
   * This branch is priced from another venue's menu.
   *
   * The Honeysuckle has five locations and one menu, held once on the Osu row.
   * Null means the venue owns its own. One level only, enforced by a trigger,
   * so nothing has to walk a chain.
   */
  menu_shared_from?: string | null;
  /**
   * Google's opening periods, verbatim. Null means the hours are not known,
   * which is deliberately not the same as closed and is never read as either.
   */
  opening_periods?: unknown;
  opening_hours_text?: string[] | null;
  hours_synced_at?: string | null;
  /**
   * 1 to 5 on how the place looks. Null means nobody has judged it, which is
   * deliberately not the same as average.
   */
  aesthetics: number | null;
  /**
   * Where the price came from. An estimate is shown as a range rather than a
   * figure, because presenting a guess to the cedi is the same lie as an
   * invented price, only better dressed.
   */
  price_source: "menu" | "estimated" | "unknown";
  /** Half-width of an estimate, as a fraction. Ignored for menu prices. */
  price_spread: number;
  /** Google Places link, the join key, and how closures get noticed. */
  google_place_id: string | null;
  business_status: string | null;
  price_level: string | null;
  lat: number | null;
  lng: number | null;
  areas?: { name: string } | null;
}

export interface MenuItem {
  id: string;
  venue_id: string;
  name: string;
  category: MenuCategory;
  price_ghs: number;
  notes: string | null;
  updated_at?: string;
  /**
   * How many people one purchase covers. A plate of food is 1; a foosball
   * table sold as a table with two people at it is 2. Getting this wrong on an
   * arcade price list bills a couple twice for the same game.
   */
  covers_people?: number;
  /** Fewest the venue will run it for. Cypher Zone laser tag is 6. */
  min_players?: number | null;
  max_players?: number | null;
  duration_minutes?: number | null;
  min_age?: number | null;
  requires_gear?: string | null;
  /**
   * When this price is on sale, in minutes from midnight. Aura's padel court
   * is GHS 300 before 16:00 and GHS 600 after it, and quoting the wrong one
   * is off by half in whichever direction. Null means all day.
   */
  available_from_minute?: number | null;
  available_to_minute?: number | null;
}

export interface EventRow {
  id: string;
  title: string;
  venue_id: string | null;
  area_id: string;
  event_date: string;
  start_time: string | null;
  cost_ghs: number | null;
  category: string;
  source_url: string | null;
  is_active: boolean;
}

/**
 * Who the plan is for. Asked only when the outing is a pair, and only to make
 * the copy read naturally, never to filter venues. "unspecified" is the
 * default and always a valid answer.
 */
export type Gender = "unspecified" | "female" | "male";

/** Derived from Gender for copy; no longer asked directly. */
export type Pronoun = "they" | "she" | "he";

/**
 * Which kinds of stop the outing is made of.
 *
 * "Everything" lets the time of day shape the evening. The rest are asked for
 * deliberately, a bar crawl and a dinner-then-drinks evening are different
 * requests, and inferring one from a vibe tag got it wrong often enough that
 * it is worth one tap to be told.
 */
export type PlanFocus = "everything" | "food" | "drinks" | "activities";

/**
 * What kind of kitchen. Accra eats two ways and a chop bar and a
 * Mediterranean place are both type = "restaurant".
 */
export type PlanCuisine = "either" | "local" | "continental";

/** How dressed-up the evening should be. */
export type Formality = "either" | "casual" | "fancy";

export interface PlanInputs {
  areaIds: string[];
  areaNames: string[];
  surpriseMe: boolean;
  /** 1 = a solo outing. Drives portions, table size and the whole budget. */
  partySize: number;
  /** Names of the others, for groups. Optional and purely for warmth in copy. */
  companions: string[];
  budget: number;
  date: string; // ISO yyyy-mm-dd
  startTime: string; // e.g. "17:30"
  hours: number; // duration of the outing
  vibes: string[];
  focus: PlanFocus;
  cuisine: PlanCuisine;
  formality: Formality;
  occasion: Occasion;
  /**
   * Answers to the occasion's own question, keyed by field. Whose birthday it
   * is, what someone graduated in, what a solo day is for, the things that
   * make a plan specific rather than generically correct.
   */
  occasionDetail: Record<string, string>;
  partner: {
    name: string; // optional display name ("" allowed)
    gender: Gender;
    food: string;
    place: string;
    interests: string;
    avoid: string;
  };
}

/* ── Itinerary shape returned by the model (also embedded in the prompt) ── */

export interface ItineraryOrder {
  item: string;
  qty: number;
  price_ghs: number; // total for qty, from real menu_items
}

export type Occasion =
  | "first_date"
  | "anniversary"
  | "date_night"
  | "friend_outing"
  | "birthday"
  | "graduation"
  | "celebration"
  | "solo_day";

export interface ItineraryStop {
  venue_id: string;
  kind: "venue" | "event";
  name: string;
  area: string;
  arrival_time: string; // "5:30 PM"
  duration_mins: number;
  label: string; // e.g. "DINNER", "MUSIC & DESSERT"
  what_to_do: string; // one sentence, for activities/events
  orders: ItineraryOrder[]; // [] for pure activities
  /** Total for the whole party at this stop. */
  est_cost_ghs: number;
  why_this_fits: string;
  image_url: string | null;
  google_maps_url?: string | null;
  reservation_required?: boolean;
  reservation_requested?: boolean; // set client-side once a request is sent
  /**
   * Runners-up for this slot, chosen at the same time as the stop itself.
   * A swap is then a local substitution rather than another model call.
   */
  alternates?: StopAlternate[];
}

export interface StopAlternate {
  venue_id: string;
  name: string;
  area: string;
  image_url: string | null;
  google_maps_url: string | null;
  reservation_required: boolean;
  orders: ItineraryOrder[];
  est_cost_ghs: number;
  why_this_fits: string;
}

/**
 * How much of a plan rests on estimates.
 *
 * Carried on the itinerary so the client can decide between an exact total and
 * a range without re-deriving it from every stop.
 */
export interface PriceConfidence {
  /** True when every stop was priced from a menu or a stated rate. */
  exact: boolean;
  /** Low and high ends of the total, equal to each other when exact. */
  low: number;
  high: number;
  /** Stops whose price is an estimate, by name, for an honest footnote. */
  estimatedStops: string[];
}

export interface TransportHop {
  from: string;
  to: string;
  mins: number;
  cost_ghs: number; // always an estimate
}

export interface Itinerary {
  title: string;
  date: string;
  summary_route: string; // "Osu → Labone → Cantonments"
  stops: ItineraryStop[];
  hops: TransportHop[]; // hops[i] sits between stops[i] and stops[i+1]
  food_total_ghs: number;
  transport_total_ghs: number;
  est_total_ghs: number;
  /**
   * Whether that total can be stated as a figure or only as a range.
   * Optional so a plan generated before this existed still renders.
   */
  price_confidence?: PriceConfidence;
  budget_note: string | null; // honest note when budget is tight
  personal_summary: string; // "Built around them" card text
}

export type GenerateResponse =
  | { status: "ok"; itinerary: Itinerary }
  | {
      status: "no_match";
      headline: string;
      message: string;
      suggestions: {
        label: string;
        action: "widen_area" | "raise_budget" | "clear_focus";
        value?: number;
      }[];
    }
  | { status: "error"; message: string };

export type ReservationStatus = "requested" | "sent" | "confirmed" | "declined" | "cancelled";

export interface ReservationRequest {
  id: string;
  venue_id: string | null;
  venue_name: string;
  user_id: string | null;
  plan_slug: string | null;
  party_size: number;
  reservation_date: string;
  arrival_time: string;
  guest_name: string | null;
  status: ReservationStatus;
  channel: string;
  created_at: string;
}

export interface SavedPlan {
  id: string;
  user_id: string | null;
  share_slug: string;
  inputs: PlanInputs;
  itinerary: Itinerary;
  total_budget_ghs: number;
  estimated_total_ghs: number;
  /** A line from whoever made the plan, shown on the shared card. */
  planner_note: string | null;
  created_at: string;
}
