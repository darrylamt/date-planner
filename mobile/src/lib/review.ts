import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo-modules-core";
import { nativeOptional } from "./nativeOptional";

/*
 * The store's own rating prompt (Apple's, or Google Play's in-app review),
 * from build 24. expo-store-review asks for its native
 * half the moment it is imported, so it is looked for first.
 */
type ReviewModule = typeof import("expo-store-review");
const Review: ReviewModule | null =
  requireOptionalNativeModule("ExpoStoreReview")
    ? nativeOptional<ReviewModule>(() => require("expo-store-review"))
    : null;

const KEY = "duro.review";
const QUIET_DAYS = 120;

/**
 * Ask for a rating after a plan has actually been sent to somebody.
 *
 * Sharing is the moment the app has plainly worked: the plan was good enough
 * to put in front of the person it is for. The first share might be
 * curiosity, the second is use, so it is the second that asks, and then not
 * again for four months. Apple adds its own limits on top (three a year, and
 * it may decide not to show it at all), so this only ever offers.
 *
 * A beat after the share sheet has gone, so the two are not on screen at once.
 */
export async function afterSharing(): Promise<void> {
  if (!Review) return;
  let state: { shares: number; askedAt: number | null } = { shares: 0, askedAt: null };
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) state = { ...state, ...(JSON.parse(raw) as typeof state) };
  } catch {
    // A missing count costs one prompt being a share late.
  }
  state.shares += 1;
  const quiet = state.askedAt != null && Date.now() - state.askedAt < QUIET_DAYS * 86_400_000;
  const ask = state.shares >= 2 && !quiet && (await Review.isAvailableAsync().catch(() => false));
  if (ask) state.askedAt = Date.now();
  await AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
  if (ask) setTimeout(() => void Review.requestReview().catch(() => undefined), 1200);
}
