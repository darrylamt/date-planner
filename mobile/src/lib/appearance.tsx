import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "aduro.appearance";

/**
 * Light, dark, or whatever the phone is doing.
 *
 * "system" is the default and stays the default: someone who has set their
 * phone to switch at sunset has already expressed a preference, and an app
 * that ignores it to keep its own copy is an app that gets it wrong twice a
 * day. The override exists because plenty of people want one app dark and the
 * rest of the phone light, and there was previously no way to say so.
 */
export type Appearance = "system" | "light" | "dark";
export type ResolvedScheme = "light" | "dark";

interface AppearanceValue {
  /** What the user chose. */
  preference: Appearance;
  /** What that resolves to right now, once the phone is taken into account. */
  scheme: ResolvedScheme;
  setPreference: (next: Appearance) => void;
  /** False until the stored choice has been read, to avoid a wrong first paint. */
  ready: boolean;
}

const AppearanceContext = createContext<AppearanceValue>({
  preference: "system",
  scheme: "light",
  setPreference: () => {},
  ready: false,
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<Appearance>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(KEY);
        if (active && (stored === "light" || stored === "dark" || stored === "system")) {
          setPreferenceState(stored);
        }
      } catch {
        // Storage unavailable. The default already covers this.
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: Appearance) => {
    // Applied immediately and persisted after: a toggle that waits on disk
    // before moving feels broken.
    setPreferenceState(next);
    void AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  /*
   * Null from useColorScheme means "not known yet", which is treated as light
   * rather than dark so the app never flashes a dark frame on a light phone.
   */
  const scheme: ResolvedScheme =
    preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  return (
    <AppearanceContext.Provider value={{ preference, scheme, setPreference, ready }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceValue {
  return useContext(AppearanceContext);
}
