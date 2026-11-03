import { useEffect, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { AppleMaps } from "expo-maps";
import { useLook } from "../../lib/appearance";
import { useReducedMotion } from "../motion";
import type { Itinerary } from "../../lib/types";
import { DrawnRouteMap } from "./DrawnRouteMap";
import { stopColours } from "./stopColours";

/*
 * The plan's route on the real map (owner, 3 Nov 2026: "can we use the actual
 * map"): Apple Maps, muted, in the look's light or dark, the stops as numbered
 * pins in the stop colours and the line between them drawing itself. A plan
 * without pins for its stops falls back to the drawn map (RouteMap.tsx).
 */

type LatLng = { latitude: number; longitude: number };

/** The middle of the points and a zoom that shows them all, with room round the edge. */
export function fitCamera(points: LatLng[], width: number, height: number): { coordinates: LatLng; zoom: number } {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const spanLng = Math.max((maxLng - minLng) * 1.6, 0.006);
  const spanLat = Math.max((maxLat - minLat) * 1.6, 0.006);
  // A 256-point world at zoom 0: how many doublings until the span fills the view.
  const byLng = Math.log2(((width / 256) * 360) / spanLng);
  const byLat = Math.log2(((height / 256) * 170) / spanLat);
  return {
    coordinates: { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 },
    zoom: Math.max(9, Math.min(16, Math.min(byLng, byLat))),
  };
}

/** Points along the path, so the line can be drawn a little at a time. */
function along(points: LatLng[], t: number): LatLng[] {
  if (points.length < 2 || t >= 1) return points;
  const seg = (points.length - 1) * t;
  const whole = Math.floor(seg);
  const part = seg - whole;
  const a = points[whole];
  const b = points[whole + 1];
  return [...points.slice(0, whole + 1), { latitude: a.latitude + (b.latitude - a.latitude) * part, longitude: a.longitude + (b.longitude - a.longitude) * part }];
}

export function RouteMap({ itinerary, height }: { itinerary: Itinerary; height: number }) {
  const look = useLook();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const points = useMemo(
    () =>
      itinerary.stops
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({ latitude: Number(s.lat), longitude: Number(s.lng) })),
    [itinerary]
  );
  const [t, setT] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return setT(1);
    setT(0);
    const start = Date.now() + 500;
    const id = setInterval(() => {
      const f = Math.min(1, Math.max(0, (Date.now() - start) / 1300));
      setT(f);
      if (f >= 1) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [itinerary, reduced]);

  const colours = stopColours(look);
  const camera = useMemo(() => (points.length ? fitCamera(points, width, height) : undefined), [points, width, height]);

  // Too few pins to place: the drawn map, which lays them out on its own.
  if (points.length < 2) return <DrawnRouteMap itinerary={itinerary} height={height} />;

  return (
    <AppleMaps.View
      style={{ width, height }}
      cameraPosition={camera}
      colorScheme={look.scheme === "dark" ? AppleMaps.MapColorScheme.DARK : AppleMaps.MapColorScheme.LIGHT}
      // Muted, so the plan's pins and line are what stand out.
      properties={{ emphasis: "MUTED" as never, selectionEnabled: false }}
      uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false, scaleBarEnabled: false, togglePitchEnabled: false }}
      markers={itinerary.stops
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.lat != null && s.lng != null)
        .map(({ s, i }) => ({
          id: `stop-${i}`,
          coordinates: { latitude: Number(s.lat), longitude: Number(s.lng) },
          title: s.name,
          monogram: String(i + 1),
          tintColor: colours[i % colours.length].bg,
        }))}
      polylines={points.length > 1 ? [{ id: "route", coordinates: along(points, t), color: look.id === "daylight" ? look.colors.accent : look.primary, width: 5 }] : []}
    />
  );
}
