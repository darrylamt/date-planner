import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import {
  PlacesNotConfigured,
  placeDetails,
  placesConfigured,
  searchPlaces,
} from "@/lib/places";

/**
 * Google Places lookup for the admin venue form.
 *
 * Two actions rather than two routes, because they are one flow: search by
 * name, pick the right result, then pull its details. The key stays server-side
 * — a Places key in the browser is a key anyone can spend.
 */
export const maxDuration = 30;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().min(2).max(200) }),
  z.object({ action: z.literal("details"), placeId: z.string().min(4).max(400) }),
]);

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  if (!placesConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google Places is not configured. Add GOOGLE_PLACES_API_KEY to .env.local and to the deployment.",
      },
      { status: 501 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    if (body.action === "search") {
      return NextResponse.json({ results: await searchPlaces(body.query) });
    }
    return NextResponse.json({ details: await placeDetails(body.placeId) });
  } catch (e) {
    if (e instanceof PlacesNotConfigured) {
      return NextResponse.json({ error: e.message }, { status: 501 });
    }
    console.error("places lookup failed", e);
    // Google's own message is genuinely useful here — a disabled API, a
    // referrer-restricted key and an exhausted quota all need different fixes,
    // and hiding which one it was makes setup guesswork.
    return NextResponse.json(
      { error: (e as Error).message ?? "Places lookup failed." },
      { status: 502 }
    );
  }
}
