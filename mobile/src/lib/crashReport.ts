import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportIssue } from "./api";

/*
 * What went wrong, sent to the admin's Issues (issue_reports), so a crash
 * names itself (30 Oct 2026). An iPhone crashed on Build after the 29 Oct
 * update and the phone's own crash reports carry no JavaScript message, so
 * the cause could not be found from them.
 *
 * Kept on the phone first: a fatal error ends the app soon after, so a
 * report that did not make it out goes on the next launch.
 */
const KEY = "duro.crash.pending.v1";

type Pending = { message: string; lastError: string; screen: string; at: string };

function describe(error: unknown): { message: string; lastError: string } {
  const e = error instanceof Error ? error : new Error(String(error));
  const head = `${e.name}: ${e.message}`;
  return { message: `App error: ${head}\n\n${e.stack ?? ""}`.slice(0, 2000), lastError: head.slice(0, 400) };
}

async function send(p: Pending): Promise<boolean> {
  const res = await reportIssue({
    area: "other",
    message: `${p.message}\n\nat ${p.at}`.slice(0, 2000),
    context: {
      lastError: p.lastError,
      screen: p.screen.slice(0, 60),
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? undefined,
      buildNumber:
        Platform.OS === "ios"
          ? (Constants.expoConfig?.ios?.buildNumber ?? undefined)
          : String(Constants.expoConfig?.android?.versionCode ?? "") || undefined,
    },
  });
  return res.ok;
}

/** Report an error: kept, then sent, and forgotten once it is through. */
export async function reportCrash(error: unknown, screen: string): Promise<void> {
  const p: Pending = { ...describe(error), screen, at: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Nowhere to keep it; sending is still worth a try.
  }
  try {
    if (await send(p)) await AsyncStorage.removeItem(KEY);
  } catch {
    // Stays kept for the next launch.
  }
}

type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler(): Handler; setGlobalHandler(h: Handler): void };

let installed = false;

/**
 * Every uncaught error is reported. A fatal one waits up to two seconds for
 * the report before the app goes down as before; a screen that fails to draw
 * is caught first by the root ErrorBoundary and does not reach here.
 */
export function installCrashReporter(): void {
  if (installed) return;
  installed = true;

  // One left over from a launch that ended too soon to send it.
  void (async () => {
    try {
      const kept = await AsyncStorage.getItem(KEY);
      if (kept && (await send(JSON.parse(kept) as Pending))) await AsyncStorage.removeItem(KEY);
    } catch {
      // Tried again next launch.
    }
  })();

  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      void reportCrash(error, "non-fatal");
      previous(error, isFatal);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      previous(error, isFatal);
    };
    void reportCrash(error, "fatal").finally(finish);
    setTimeout(finish, 2000);
  });
}
