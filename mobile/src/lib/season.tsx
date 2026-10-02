import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The time of year the app is dressed for, if any.
 *
 * Halloween runs from 20 October to 1 November on the phone's own calendar,
 * and switches itself on and off with no update. A preview can be turned on
 * from Profile (hold the version line) to see it outside those dates, and is
 * kept on the phone until turned off again.
 */
export type Season = "halloween" | null;

const PREVIEW_KEY = "duro.season.preview";

/** Inclusive, as month and day: the run-up, the night, and the morning after. */
export function isHalloween(at: Date = new Date()): boolean {
  const m = at.getMonth() + 1;
  const d = at.getDate();
  return (m === 10 && d >= 20) || (m === 11 && d <= 1);
}

const SeasonContext = createContext<{ season: Season; preview: boolean; setPreview: (on: boolean) => void }>({
  season: null,
  preview: false,
  setPreview: () => {},
});

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [preview, setPreviewState] = useState(false);
  // Read once at launch and on every return to the app is plenty: a season
  // turning over while the app sits open on the night is not worth a timer.
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(PREVIEW_KEY)
      .then((v) => active && setPreviewState(v === "halloween"))
      .catch(() => undefined);
    const t = setInterval(() => setToday(new Date()), 60 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const setPreview = useCallback((on: boolean) => {
    setPreviewState(on);
    void (on ? AsyncStorage.setItem(PREVIEW_KEY, "halloween") : AsyncStorage.removeItem(PREVIEW_KEY)).catch(() => {});
  }, []);

  const season: Season = isHalloween(today) || preview ? "halloween" : null;
  return <SeasonContext.Provider value={{ season, preview, setPreview }}>{children}</SeasonContext.Provider>;
}

export function useSeason() {
  return useContext(SeasonContext);
}
