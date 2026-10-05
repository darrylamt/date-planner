import { Platform } from "react-native";

/**
 * Who sells the subscription and where people go to change it, in the words
 * of the phone in their hand. An Android user told to look in their Apple ID
 * has nowhere to look.
 */
const ANDROID = Platform.OS === "android";

const PACKAGE = "com.darrylamt.aduro";
const APP_STORE_ID = "6809005685";

/** The shop the app came from: "the App Store" or "Google Play". */
export const STORE = ANDROID ? "Google Play" : "the App Store";

/** Who takes the money and keeps billing. */
export const BILLER = ANDROID ? "Google Play" : "Apple";

/** The account a purchase belongs to. */
export const STORE_ACCOUNT = ANDROID ? "Google account" : "Apple ID";

/** Where to cancel, as a sentence ending. */
export const CANCEL_WHERE = ANDROID
  ? "in Google Play, under Payments and subscriptions"
  : "in Settings, under your name, then Subscriptions";

/** The store's own page for managing subscriptions. */
export const MANAGE_URL = ANDROID
  ? `https://play.google.com/store/account/subscriptions?package=${PACKAGE}`
  : "itms-apps://apps.apple.com/account/subscriptions";

/** The app's page in the store, open on writing a review. */
export const REVIEW_URL = ANDROID
  ? `market://details?id=${PACKAGE}&showAllReviews=true`
  : `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`;

/** Where to cancel, short enough for the paywall's small print. */
export const CANCEL_SHORT = ANDROID ? "in Google Play" : "in your Apple ID settings";
