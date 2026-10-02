import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useReducedMotion } from "./motion";

/**
 * Little bursts of emoji thrown out from a point on the screen: pumpkins and
 * bats from a button pressed at Halloween, sweets for "trick or treat".
 *
 * One layer over the whole app, so any button can throw from wherever it was
 * pressed without owning an overlay of its own. Decoration only: the native
 * driver, untouchable, gone in under a second, and nothing at all under
 * Reduce Motion.
 */
type Particle = { id: number; glyph: string; x: number; y: number; dx: number; dy: number; spin: number; size: number; value: Animated.Value };

const BurstContext = createContext<(x: number, y: number, glyphs: string[], count?: number, size?: number) => void>(() => {});

export function BurstProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [particles, setParticles] = useState<Particle[]>([]);
  const next = useRef(0);

  const burst = useCallback(
    (x: number, y: number, glyphs: string[], count = 7, size?: number) => {
      if (reduced || !glyphs.length) return;
      const made: Particle[] = Array.from({ length: Math.min(count, 30) }, () => {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
        const distance = 60 + Math.random() * 90;
        return {
          id: next.current++,
          glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
          x,
          y,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          spin: (Math.random() - 0.5) * 120,
          size: size ?? 18 + Math.random() * 12,
          value: new Animated.Value(0),
        };
      });
      setParticles((cur) => [...cur, ...made]);
      Animated.parallel(
        made.map((p) =>
          Animated.timing(p.value, { toValue: 1, duration: 850 + Math.random() * 250, easing: Easing.out(Easing.quad), useNativeDriver: true })
        )
      ).start(() => setParticles((cur) => cur.filter((p) => !made.includes(p))));
    },
    [reduced]
  );

  return (
    <BurstContext.Provider value={burst}>
      <View style={{ flex: 1 }}>
        {children}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {particles.map((p) => (
            <Animated.Text
              key={p.id}
              style={{
                position: "absolute",
                left: p.x - p.size / 2,
                top: p.y - p.size / 2,
                fontSize: p.size,
                opacity: p.value.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: p.value.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                  // Up and out, then a little fall, as thrown things do.
                  { translateY: p.value.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy, p.dy + 30] }) },
                  { rotate: p.value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin}deg`] }) },
                  { scale: p.value.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.1, 0.9] }) },
                ],
              }}
            >
              {p.glyph}
            </Animated.Text>
          ))}
        </View>
      </View>
    </BurstContext.Provider>
  );
}

/** Throw a burst of `glyphs` from (x, y), in screen coordinates. */
export function useBurst() {
  return useContext(BurstContext);
}

/** What Halloween throws. */
export const SPOOKY = ["🎃", "🦇", "👻", "🕸️"];
export const SWEETS = ["🍬", "🍭", "🍫", "🎃"];
