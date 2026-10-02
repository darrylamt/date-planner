/**
 * Duro! on the App Store, in whichever country the visitor is. Apple finds the
 * app by its id: the old address carried "/gh/" and "adurogh", which still work
 * but sent everybody to the Ghana store, and the app is now in 174 countries.
 *
 * Linked with rel="noopener" and never "noreferrer": App Store Connect counts
 * installs by the web page that sent them, and a stripped referrer counts as
 * nobody.
 */
export const APP_STORE_URL = "https://apps.apple.com/app/id6809005685";

/*
 * Apple's provider token for this developer account, which a campaign link
 * needs before App Store Connect will count it. Shown when generating one under
 * App Analytics → Acquisition → Campaigns; a wrong one only loses the count,
 * the link itself still opens the app's page.
 */
const PROVIDER_TOKEN = "129316181";

/** Where on the web an App Store tap came from, as App Store Connect will list it. */
export type StoreCampaign = "shared_plan" | "get_page" | "name_poll";

/**
 * The App Store link tagged with where it was tapped, so downloads can be
 * counted per place: App Store Connect → App Analytics → Acquisition → Campaigns.
 */
export const storeLink = (campaign: StoreCampaign) => `${APP_STORE_URL}?pt=${PROVIDER_TOKEN}&ct=${campaign}&mt=8`;
