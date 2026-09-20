import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The only thing in this product that may grant a paid tier.
 *
 * The app knows whether RevenueCat thinks somebody has paid, and uses that to
 * draw a screen. It is never allowed to unlock anything, because a client that
 * can tell the server it is pro is a paywall that a rooted phone talks its way
 * past. Apple tells RevenueCat, RevenueCat calls this, and this writes the
 * entitlements row that consume_chat_message reads.
 *
 * entitlements grants no INSERT or UPDATE to anybody signed in, so the service
 * role used here is the only writer that exists.
 */
export const dynamic = "force-dynamic";

/**
 * What each event means for access, and nothing more.
 *
 * Deliberately a small map rather than a switch on every RevenueCat event
 * type. New event types appear; an unknown one must leave the row alone rather
 * than fall through to a default that revokes somebody's subscription because
 * we had not heard of the event yet.
 */
const GRANTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
]);

/** Access ends now. */
const REVOKES = new Set(["EXPIRATION", "REFUND", "SUBSCRIPTION_PAUSED"]);

/**
 * Payment failed but they are not out yet.
 *
 * Grace is a real state rather than a courtesy: Apple retries a failed card
 * for days, and cutting somebody off mid-sentence over a card their bank
 * declined once is how a renewal becomes a cancellation.
 */
const GRACE = new Set(["BILLING_ISSUE"]);

interface RcEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  expiration_at_ms?: number | null;
  entitlement_ids?: string[] | null;
  store?: string;
}

export async function POST(req: Request) {
  /*
   * RevenueCat sends whatever Authorization header you configure on the
   * webhook. Checked before the body is read: this endpoint writes paid
   * access, and an unauthenticated caller must not even get as far as parsing.
   */
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("REVENUECAT_WEBHOOK_SECRET is not set; refusing to process.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (req.headers.get("authorization") !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  let event: RcEvent;
  try {
    const body = (await req.json()) as { event?: RcEvent };
    event = body.event ?? {};
  } catch {
    return NextResponse.json({ error: "Unreadable body." }, { status: 400 });
  }

  const type = event.type ?? "";
  /*
   * app_user_id is the Supabase user id, because the app configures RevenueCat
   * with exactly that and nothing else. If it is ever not a uuid, something
   * has been configured wrong and writing a row would be worse than failing.
   */
  const userId = event.app_user_id ?? event.original_app_user_id ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    console.error("revenuecat webhook: app_user_id is not a Supabase id", { type, userId });
    // 200 on purpose: retrying will not fix a misconfiguration, and RevenueCat
    // would keep redelivering it for days.
    return NextResponse.json({ ignored: "app_user_id is not a user id" });
  }

  const supabase = createServiceClient();

  let patch: Record<string, unknown> | null = null;

  if (GRANTS.has(type)) {
    patch = {
      tier: "pro",
      status: "active",
      source: sourceFor(event.store),
      expires_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
      rc_app_user_id: userId,
    };
  } else if (REVOKES.has(type)) {
    patch = { tier: "free", status: "expired", expires_at: null };
  } else if (GRACE.has(type)) {
    patch = { status: "in_grace" };
  } else if (type === "CANCELLATION") {
    /*
     * Cancelled is not expired. They have turned off auto-renew and keep what
     * they paid for until the period ends; EXPIRATION arrives then and does
     * the actual revoking. Taking access away here would be charging somebody
     * for a month and giving them part of it.
     */
    patch = { status: "cancelled" };
  }

  if (!patch) {
    // TRANSFER, TEST, and anything invented after this was written. Leaving
    // the row untouched is the only safe response to an event we do not know.
    return NextResponse.json({ ignored: type });
  }

  const { error } = await supabase
    .from("entitlements")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, {
      onConflict: "user_id",
    });

  if (error) {
    console.error("revenuecat webhook: could not write entitlement", { type, userId, error });
    // 500 so RevenueCat retries. A dropped grant is somebody who paid and
    // cannot use what they bought.
    return NextResponse.json({ error: "Could not record that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type, userId });
}

/**
 * RevenueCat's word for the store, in this schema's vocabulary.
 *
 * ── the bug this exists to prevent ──────────────────────────────────────
 * This wrote "app_store", and entitlements_source_check allows only
 * 'apple', 'stripe' and 'grant'. Every real purchase would have been
 * rejected by the constraint, returned 500, and been retried by RevenueCat
 * for days while the buyer stared at the paywall they had just paid to
 * remove. The revoke path wrote no source at all, so expiries worked
 * perfectly and the failure looked like nothing at all until somebody
 * actually bought something.
 *
 * ── why an unknown store writes null ────────────────────────────────────
 * Null, never a guess. `source` is nullable and only says where a purchase
 * came from; the constraint would reject an unrecognised string and take the
 * entire grant down with it. Losing the label is a reconciliation
 * inconvenience. Losing the grant is somebody who paid and cannot use what
 * they bought, which is the one outcome this endpoint exists to prevent.
 */
function sourceFor(store: string | undefined): string | null {
  switch (store) {
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "apple";
    case "PLAY_STORE":
      return "play";
    case "STRIPE":
    case "RC_BILLING":
      return "stripe";
    default:
      return null;
  }
}
