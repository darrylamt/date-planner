import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_LOOK, LOOKS, isLookChoice, lookFor, type Look, type LookChoice } from "./looks";

const KEY = "duro.look";

/**
 * The look the app wears (looks.ts): Kente, Night, Daylight, or the sky.
 *
 * It replaces the old light, dark or "match my phone" choice: each look
 * already is light or dark, and "Follow the sky" does the switching that
 * matching the phone used to. The old names stay as a thin layer over it,
 * for the screens that still ask in those terms.
 */
export type Appearance = "system" | "light" | "dark";
export type ResolvedScheme = "light" | "dark";

interface AppearanceValue {
  /** The look chosen, and the one being worn right now. */
  choice: LookChoice;
  look: Look;
  setLook: (next: LookChoice) => void;
  /** The same choice in the old terms. */
  preference: Appearance;
  scheme: ResolvedScheme;
  setPreference: (next: Appearance) => void;
  /** False until the stored choice has been read, to avoid a wrong first paint. */
  ready: boolean;
}

const AppearanceContext = createContext<AppearanceValue>({
  choice: DEFAULT_LOOK,
  look: LOOKS.kente,
  setLook: () => {},
  preference: "dark",
  scheme: "dark",
  setPreference: () => {},
  ready: false,
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<LookChoice>(DEFAULT_LOOK);
  const [ready, setReady] = useState(false);
  // The sky turns over at six, morning and evening; checked every ten minutes.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (active && isLookChoice(stored)) setChoice(stored);
      })
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    const t = setInterval(() => setNow(new Date()), 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const setLook = useCallback((next: LookChoice) => {
    // Applied at once and saved after: a choice that waits on disk feels broken.
    setChoice(next);
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  const setPreference = useCallback(
    (next: Appearance) => setLook(next === "light" ? "daylight" : next === "dark" ? "night" : "sky"),
    [setLook]
  );

  const look = lookFor(choice, now);
  const preference: Appearance = choice === "sky" ? "system" : look.scheme;

  return (
    <AppearanceContext.Provider
      value={{ choice, look, setLook, preference, scheme: look.scheme, setPreference, ready }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceValue {
  return useContext(AppearanceContext);
}

/** The look being worn, for screens drawn in the new design. */
export function useLook(): Look {
  return useContext(AppearanceContext).look;
}
