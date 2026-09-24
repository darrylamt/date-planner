import { nativeOptional } from "./nativeOptional";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureSession } from "./useAuth";
import { supabase } from "./supabase";

/**
 * Buying, restoring, and knowing whether somebody has paid.
 *
 * ── the module is optional, and that is load-bearing ────────────────────
 * react-native-purchases is native, and native code does not ship over the
 * air. Every build already on a phone will receive this JavaScript and find no
 * native side, so importing it directly would throw on the first render of the
 * paywall. nativeOptional turns that into null and the paywall says the store
 * is unreachable, which is true.
 *
 * ── the app never decides who is pro ────────────────────────────────────
 * RevenueCat tells this app what it has, and the app uses that to draw a
 * screen. It does not use it to unlock anything. The gate is consumeMessage on
 * the server, reading the entitlements table, written only by the webhook.
 * Anything else would be a paywall a rooted phone can lie its way past.
 */
const Purchases = nativeOptional<typeof import("react-native-purchases")>(() =>
  require("react-native-purchases")
);

/**
 * The entitlement identifier configured in RevenueCat. Not the product id.
 *
 * It has to match the dashboard exactly. This read "pro" while RevenueCat had
 * "aduro_pro", which is the quietest possible failure: the purchase goes
 * through, Apple takes the money, the webhook writes the entitlement row, and
 * the app looks for a key that is not in the customer info and shows the
 * paywall again to somebody who has just paid.
 */
const ENTITLEMENT = "aduro_pro";

/**
 * Public, and safe to ship in the bundle.
 *
 * RevenueCat's SDK keys are scoped to reading offerings and making purchases
 * as the signed-in app user; the secret key that can grant entitlements lives
 * on the server and is not here.
 */
const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_KEY ?? "";

export function purchasesAvailable(): boolean {
  return Purchases !== null && API_KEY !== "";
}

let configuredFor: string | null = null;

/** Where the id of an account-less buyer is remembered across launches. */
const ANONYMOUS_BUYER = "aduro.purchases.anonymousId";

/**
 * Point RevenueCat at the Supabase user, so a purchase lands on the right row.
 *
 * The app user id is the Supabase id and nothing else: it is what the webhook
 * matches on. Somebody who has not registered is given an account-less
 * Supabase id first (see ensureSession), because App Review requires that Pro
 * can be bought without registering -- guideline 5.1.1(v) -- and a
 * RevenueCat-generated anonymous id would be one the webhook could never
 * match to a row.
 */
export async function configurePurchases(): Promise<void> {
  if (!Purchases || !API_KEY) return;
  const userId = await ensureSession();
  if (userId) await identify(userId);
}

async function identify(userId: string): Promise<void> {
  if (!Purchases || configuredFor === userId) return;
  try {
    /*
     * configure once, logIn after. RevenueCat allows one configure per launch;
     * a second one for a different user was silently ignored, which would have
     * left a newly registered person's purchases landing on the id they had
     * before they registered.
     */
    if (configuredFor === null) Purchases.default.configure({ apiKey: API_KEY, appUserID: userId });
    else await Purchases.default.logIn(userId);
    configuredFor = userId;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.is_anonymous) await AsyncStorage.setItem(ANONYMOUS_BUYER, userId).catch(() => undefined);
  } catch {
    // A store that will not configure is a paywall that says so, not a crash.
  }
}

/**
 * Bring a subscription bought without an account across to the new one.
 *
 * Called once somebody registers or signs in. Syncing posts the device's
 * receipt under the new id, and RevenueCat moves the subscription from the
 * account-less id to it and tells the webhook with a TRANSFER event. Sync
 * rather than restore, because restore can raise an App Store sign-in prompt
 * that nobody asked for.
 *
 * Only when the device really did have an account-less buyer, so signing in
 * on a shared iPad does not quietly move somebody else's subscription.
 */
export async function adoptPurchases(): Promise<void> {
  if (!Purchases || !API_KEY) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return;

  const previous = await AsyncStorage.getItem(ANONYMOUS_BUYER).catch(() => null);
  await identify(user.id);
  if (previous && previous !== user.id) {
    try {
      await Purchases.default.syncPurchases();
    } catch {
      // Restore Purchases on the paywall does the same thing by hand.
    }
    await AsyncStorage.removeItem(ANONYMOUS_BUYER).catch(() => undefined);
  }
}

export interface Offer {
  /** What the store says it costs, already in the viewer's currency. */
  priceString: string;
  /** "1 month", for the renewal sentence. */
  period: string;
  /** Days of free trial, 0 when there is none. Shown before the price. */
  trialDays: number;
  /** Handed straight back to purchase(); never reconstructed. */
  raw: unknown;
}

/**
 * What is on sale, as the store describes it.
 *
 * Never a hardcoded price. App Review rejects a paywall showing a figure that
 * disagrees with the store, and it would disagree the moment anybody opened it
 * outside Ghana or the price changed.
 */
export async function fetchOffer(): Promise<Offer | null> {
  if (!Purchases || !API_KEY) return null;

  try {
    const offerings = await Purchases.default.getOfferings();
    const pkg = offerings.current?.availablePackages?.[0];
    if (!pkg) return null;

    const product = pkg.product as {
      priceString: string;
      subscriptionPeriod?: string | null;
      introPrice?: { periodNumberOfUnits?: number; periodUnit?: string; price?: number } | null;
    };

    const intro = product.introPrice;
    /*
     * Only a genuinely free introductory period counts as a trial. A
     * discounted first month is an offer, not a trial, and calling it one on
     * the paywall is the sort of thing App Review reads as misleading.
     */
    const trialDays =
      intro && Number(intro.price ?? -1) === 0 ? daysIn(intro.periodUnit, intro.periodNumberOfUnits) : 0;

    return {
      priceString: product.priceString,
      period: describePeriod(product.subscriptionPeriod),
      trialDays,
      raw: pkg,
    };
  } catch {
    return null;
  }
}

export type PurchaseResult = "bought" | "cancelled" | "failed" | "unavailable";

export async function purchase(offer: Offer): Promise<PurchaseResult> {
  if (!Purchases) return "unavailable";
  try {
    const { customerInfo } = await Purchases.default.purchasePackage(
      offer.raw as Parameters<typeof Purchases.default.purchasePackage>[0]
    );
    return customerInfo.entitlements.active[ENTITLEMENT] ? "bought" : "failed";
  } catch (e) {
    // A cancellation is not an error and must not be reported as one.
    return (e as { userCancelled?: boolean })?.userCancelled ? "cancelled" : "failed";
  }
}

/**
 * Restore Purchases.
 *
 * App Review requires this on any paywall, and not as a formality: somebody
 * who reinstalls or changes phone has already paid, and without this their
 * subscription is invisible to the app.
 */
export async function restore(): Promise<"restored" | "nothing" | "failed"> {
  if (!Purchases) return "failed";
  try {
    const info = await Purchases.default.restorePurchases();
    return info.entitlements.active[ENTITLEMENT] ? "restored" : "nothing";
  } catch {
    return "failed";
  }
}

function daysIn(unit: string | undefined, count: number | undefined): number {
  const n = Number(count ?? 0);
  switch (unit) {
    case "DAY":
      return n;
    case "WEEK":
      return n * 7;
    case "MONTH":
      return n * 30;
    case "YEAR":
      return n * 365;
    default:
      return 0;
  }
}

/** "P1M" → "month", for a sentence rather than a label. */
function describePeriod(iso: string | null | undefined): string {
  switch (iso) {
    case "P1W":
      return "week";
    case "P1M":
      return "month";
    case "P3M":
      return "3 months";
    case "P6M":
      return "6 months";
    case "P1Y":
      return "year";
    default:
      return "month";
  }
}
