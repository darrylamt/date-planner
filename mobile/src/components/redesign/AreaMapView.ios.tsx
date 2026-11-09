import { useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { AppleMaps } from "expo-maps";
import { GUTTER } from "../../theme";
import { useLook } from "../../lib/appearance";
import type { Area, PlanInputs } from "../../lib/types";
import { Body } from "../look";
import { fitCamera } from "./RouteMap.ios";

const MAX_AREAS = 4;

/**
 * Where, on the real map (owner, 3 Nov 2026): each area a pin at its middle
 * (/api/areas), grey until chosen and the look's colour once it is. Tap a pin
 * to choose it, up to four. A loop cannot be drawn on a real map, which pans
 * under a finger, so this one is tapped; the list below does the same.
 * AreaMapView.tsx is the drawn map, for Android and the web.
 */
export function AreaMapView({
  areas,
  inputs,
  city,
  update,
}: {
  areas: Area[];
  inputs: PlanInputs;
  city: string;
  update: (p: Partial<PlanInputs>) => void;
  onDragging?: (on: boolean) => void;
}) {
  const look = useLook();
  const { width } = useWindowDimensions();
  const w = width - GUTTER * 2;
  const h = 320;
  const here = useMemo(() => areas.filter((a) => (a.city || "Accra") === city && a.lat != null && a.lng != null), [areas, city]);

  // Framed on the core of the city, as the drawn map is: the far corners would shrink everything else.
  const camera = useMemo(() => {
    if (here.length < 2) return undefined;
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.round(f * (xs.length - 1))];
    const lats = here.map((a) => a.lat!);
    const lngs = here.map((a) => a.lng!);
    return fitCamera(
      [
        { latitude: q(lats, 0.08), longitude: q(lngs, 0.08) },
        { latitude: q(lats, 0.92), longitude: q(lngs, 0.92) },
      ],
      w,
      h
    );
  }, [here, w]);

  if (here.length < 3) return null;
  const chosen = new Set(inputs.areaIds);

  const toggle = (id: string) => {
    void Haptics.selectionAsync();
    const on = chosen.has(id);
    const ids = on ? inputs.areaIds.filter((x) => x !== id) : [...inputs.areaIds, id].slice(-MAX_AREAS);
    update({
      areaIds: ids,
      areaNames: areas.filter((x) => ids.includes(x.id)).map((x) => x.name),
      city,
      surpriseMe: false,
      near: undefined,
    });
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ width: w, height: h, borderRadius: 26, overflow: "hidden", borderWidth: 1, borderColor: look.tileEdge }}>
        <AppleMaps.View
          style={{ width: w, height: h }}
          cameraPosition={camera}
          colorScheme={look.scheme === "dark" ? AppleMaps.MapColorScheme.DARK : AppleMaps.MapColorScheme.LIGHT}
          properties={{ emphasis: "MUTED" as never, selectionEnabled: false }}
          uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false, scaleBarEnabled: false, togglePitchEnabled: false }}
          markers={here.map((a) => ({
            id: a.id,
            coordinates: { latitude: a.lat!, longitude: a.lng! },
            title: a.name,
            tintColor: chosen.has(a.id) ? look.primary : "#8E8E93",
            ...(chosen.has(a.id) ? { systemImage: "checkmark" } : {}),
          }))}
          onMarkerClick={(m) => m.id && toggle(m.id)}
        />
      </View>
      <Body size={13} tone="secondary" center>
        Tap a pin to choose it. Up to four.
      </Body>
    </View>
  );
}
