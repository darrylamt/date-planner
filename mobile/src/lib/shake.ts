import { useEffect, useRef } from "react";
import { requireOptionalNativeModule } from "expo-modules-core";
import { nativeOptional } from "./nativeOptional";

/*
 * The accelerometer, from build 24. expo-sensors asks for its native half the
 * moment it is imported, so it is looked for first; on an older build there
 * is no shake, and the button that does the same thing is still there.
 */
type Reading = { x: number; y: number; z: number };
type Sensor = {
  setUpdateInterval(ms: number): void;
  addListener(fn: (r: Reading) => void): { remove(): void };
};
const Accelerometer: Sensor | null =
  requireOptionalNativeModule("ExponentAccelerometer")
    ? nativeOptional(() => (require("expo-sensors") as { Accelerometer: Sensor }).Accelerometer)
    : null;

export const shakeAvailable = (): boolean => Accelerometer != null;

/** Over 2.3 g, twice within 600 ms: a shake, not a phone dropped on a sofa or a pothole in an Uber. */
const JOLT_G = 2.3;
const WINDOW_MS = 600;
/** Long enough that one shake is one answer, not three. */
const REST_MS = 1500;

/** Calls `onShake` when the phone is shaken, while `enabled`. */
export function useShake(onShake: () => void, enabled = true) {
  const latest = useRef(onShake);
  latest.current = onShake;

  useEffect(() => {
    if (!enabled || !Accelerometer) return;
    Accelerometer.setUpdateInterval(60);
    let jolts: number[] = [];
    let last = 0;
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      if (Math.sqrt(x * x + y * y + z * z) < JOLT_G) return;
      const now = Date.now();
      jolts = jolts.filter((t) => now - t < WINDOW_MS);
      jolts.push(now);
      if (jolts.length >= 2 && now - last > REST_MS) {
        last = now;
        jolts = [];
        latest.current();
      }
    });
    return () => sub.remove();
  }, [enabled]);
}
