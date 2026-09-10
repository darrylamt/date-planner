"use client";

import { ItineraryView } from "@/components/plan/ItineraryView";
import type { Itinerary, PlanInputs } from "@/lib/types";

/**
 * "See an example plan" — a canned itinerary built from seeded venues so the
 * landing page demo works instantly without an API key or database writes.
 * Mirrors the sample evening shown in the design source.
 */

function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

const DATE = nextSaturday();

const EXAMPLE_INPUTS: PlanInputs = {
  areaIds: [],
  areaNames: ["Osu", "Labone"],
  surpriseMe: false,
  partySize: 2,
  companions: [],
  occasionDetail: {},
  budget: 800,
  date: DATE,
  startTime: "17:30",
  hours: 4,
  vibes: ["romantic", "calm"],
  occasion: "anniversary",
  partner: {
    name: "",
    gender: "unspecified",
    food: "Seafood — especially grilled tilapia",
    place: "Quiet, outdoors, near water",
    interests: "Old highlife records",
    avoid: "Shellfish allergy. Nothing too loud.",
  },
};

const EXAMPLE_ITINERARY: Itinerary = {
  title: "An anniversary evening by the water",
  date: DATE,
  summary_route: "Osu → Labone → Cantonments",
  stops: [
    {
      venue_id: "b2000000-0000-0000-0000-000000000001",
      kind: "venue",
      name: "Maame's Table",
      area: "Osu",
      arrival_time: "5:30 PM",
      duration_mins: 90,
      label: "DINNER",
      what_to_do: "Ghanaian seafood on the open-air deck",
      orders: [
        { item: "Grilled tilapia & banku", qty: 2, price_ghs: 190 },
        { item: "Passion-ginger cooler", qty: 2, price_ghs: 96 },
        { item: "Kelewele to share", qty: 1, price_ghs: 40 },
      ],
      est_cost_ghs: 326,
      why_this_fits:
        "Because they love grilled tilapia and quiet spots by the water — ask for the deck table.",
      image_url:
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=70",
      google_maps_url: "https://maps.google.com/?q=Maame's+Table+Osu",
      reservation_required: true,
    },
    {
      venue_id: "b2000000-0000-0000-0000-000000000012",
      kind: "venue",
      name: "Highlife House",
      area: "Labone",
      arrival_time: "7:15 PM",
      duration_mins: 75,
      label: "MUSIC & DESSERT",
      what_to_do: "vinyl listening bar",
      orders: [
        { item: "Toffee-plantain waffle", qty: 1, price_ghs: 68 },
        { item: "Sobolo spritz", qty: 2, price_ghs: 86 },
      ],
      est_cost_ghs: 154,
      why_this_fits: "They spin old highlife records on Saturdays — they'll know every song.",
      image_url:
        "https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=1200&q=70",
      google_maps_url: "https://maps.google.com/?q=Highlife+House+Labone",
      reservation_required: false,
    },
    {
      venue_id: "b2000000-0000-0000-0000-000000000013",
      kind: "venue",
      name: "Asa Rooftop",
      area: "Cantonments",
      arrival_time: "8:45 PM",
      duration_mins: 60,
      label: "NIGHTCAP",
      what_to_do: "skyline terrace",
      orders: [{ item: "Hibiscus mocktail", qty: 2, price_ghs: 110 }],
      est_cost_ghs: 110,
      why_this_fits: "Calm, low-lit, and never loud — the right place to end the night talking.",
      image_url:
        "https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=70",
      google_maps_url: "https://maps.google.com/?q=Asa+Rooftop+Cantonments",
      reservation_required: false,
    },
  ],
  hops: [
    { from: "Osu", to: "Labone", mins: 12, cost_ghs: 35 },
    { from: "Labone", to: "Cantonments", mins: 9, cost_ghs: 25 },
  ],
  food_total_ghs: 590,
  transport_total_ghs: 60,
  est_total_ghs: 650,
  budget_note: null,
  personal_summary: "Seafood · quiet places near water · highlife records · nothing too loud",
};

export default function ExamplePlanPage() {
  return (
    <ItineraryView
      inputs={EXAMPLE_INPUTS}
      itinerary={EXAMPLE_ITINERARY}
      onItineraryChange={() => {}}
      onEdit={() => (window.location.href = "/")}
      shareSlug={null}
      onSave={async () => null}
      saving={false}
      readOnlyDemo
    />
  );
}
