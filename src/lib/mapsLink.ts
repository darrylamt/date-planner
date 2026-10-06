/**
 * What a pasted Google Maps link says about a place.
 *
 * Planners share a place from the Maps app, which gives a maps.app.goo.gl
 * link. Followed, it lands on google.com/maps with the place's name and
 * street in `q` ("Daddy Boba!, 37 Jungle Ave, Accra"), which Places can
 * search for. Older goo.gl/maps links land on /maps/place/<name>/ with the
 * pin's own coordinates in the data segment. A `?cid=` link names nothing at
 * all, even in the page it serves, so it is reported as such and the form
 * asks for the name instead.
 *
 * Only Google's own hosts are ever fetched, at every hop. A link field that
 * follows redirects anywhere is a way to make the server fetch anything.
 */

const GOOGLE_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.com(\.gh)?|(www\.)?google\.com(\.gh)?|consent\.google\.com)$/i;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export interface MapsLinkFacts {
  /** A Places id, when the link carries one. */
  placeId: string | null;
  /** The place's name and address as the link gives them, for a text search. */
  text: string | null;
  /** The pin, when the link carries one. */
  lat: number | null;
  lng: number | null;
  /** A ?cid= link: it identifies a place but tells us nothing we can search with. */
  cidOnly: boolean;
}

/** Whether this is something we will try to read as a Maps link at all. */
export function isMapsLink(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && GOOGLE_HOST.test(u.hostname) && (u.hostname !== "www.google.com" || u.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

/** Follows a share link to the address it stands for, on Google's hosts only. */
async function follow(raw: string): Promise<URL | null> {
  let url = new URL(raw.trim());
  for (let hop = 0; hop < 6; hop++) {
    if (url.protocol !== "https:" || !GOOGLE_HOST.test(url.hostname)) return null;
    // A consent wall in front of the page names the real page in `continue`.
    if (url.hostname.startsWith("consent.")) {
      const next = url.searchParams.get("continue");
      if (!next) return null;
      url = new URL(next);
      continue;
    }
    // Long links already say everything; only short ones need fetching.
    if (!/goo\.gl$|^g\.co$/i.test(url.hostname)) return url;
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    const location = res.headers.get("location");
    if (!location) return null;
    url = new URL(location, url);
  }
  return null;
}

function coords(lat: string | undefined, lng: string | undefined): { lat: number; lng: number } | null {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}

export async function readMapsLink(raw: string): Promise<MapsLinkFacts | null> {
  if (!isMapsLink(raw)) return null;
  let url: URL | null;
  try {
    url = await follow(raw);
  } catch {
    return null;
  }
  if (!url) return null;

  const params = url.searchParams;
  const facts: MapsLinkFacts = { placeId: null, text: null, lat: null, lng: null, cidOnly: false };

  const q = params.get("q") ?? params.get("query") ?? "";
  facts.placeId = params.get("query_place_id") ?? (q.startsWith("place_id:") ? q.slice("place_id:".length) : null);

  const qPoint = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q);
  if (qPoint) {
    const p = coords(qPoint[1], qPoint[2]);
    if (p) Object.assign(facts, p);
  } else if (q && !q.startsWith("place_id:")) {
    facts.text = q;
  }

  // /maps/place/<name>/@... : the name, and the pin's own coordinates.
  const named = /\/maps\/place\/([^/@?]+)/.exec(url.pathname);
  if (named && !facts.text) facts.text = decodeURIComponent(named[1].replace(/\+/g, " "));
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url.href);
  const view = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url.pathname);
  const point = pin ? coords(pin[1], pin[2]) : view ? coords(view[1], view[2]) : null;
  if (point && facts.lat == null) Object.assign(facts, point);

  facts.cidOnly = Boolean(params.get("cid")) && !facts.placeId && !facts.text && facts.lat == null;
  return facts;
}
