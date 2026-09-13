import { createServiceClient } from "./supabase/server";

/**
 * Who may chat, and how much is left.
 *
 * Server-only, and deliberately the single place the paywall is decided. The
 * app is free to read entitlements and chat_usage directly to draw the screen,
 * but nothing it reads is trusted: the answer that governs spending is the one
 * this module computes from the service role, on the server, before the model
 * is called.
 *
 * The rule that makes the rest of it safe: a client tells us who it is, never
 * what it is owed.
 */

/**
 * Five, once, ever.
 *
 * Enough to see what the thing does; small enough that a thousand people who
 * never convert costs tens of dollars rather than hundreds. A monthly free
 * allowance would be a monthly bill for exactly the users who will not pay.
 */
export const FREE_LIFETIME_MESSAGES = 5;

/**
 * Fair use for a subscriber, not a target.
 *
 * Sized against the subscription rather than against generosity: at roughly
 * half a US cent a turn this is well under a dollar of model spend a month,
 * against a subscription netting a couple of dollars after Apple's cut. Most
 * people will never come near it. Say the number on the paywall, because a cap
 * nobody was told about reads as a fault.
 */
export const PRO_MONTHLY_MESSAGES = 150;

export type Tier = "free" | "pro";

export interface Entitlement {
  tier: Tier;
  /** Messages spent in the window that applies to this tier. */
  used: number;
  /** The cap for that window: lifetime when free, this month when pro. */
  allowance: number;
  remaining: number;
}

/**
 * What this person is currently entitled to. Reads only; spends nothing.
 *
 * For drawing a screen and for answering "how many do I have left". Never use
 * it to decide whether a request may proceed: between this read and the model
 * call, a second request can spend the last message. Deciding is
 * consumeMessage's job, and it decides by spending.
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const admin = createServiceClient();

  const { data: row } = await admin
    .from("entitlements")
    .select("tier,status,expires_at,lifetime_messages_used")
    .eq("user_id", userId)
    .maybeSingle();

  /*
   * No row means they have never chatted, which is not the same as having no
   * allowance: the row is created on the first spend. Absent reads as a full
   * free tier, which is what it is.
   */
  if (!row) {
    return {
      tier: "free",
      used: 0,
      allowance: FREE_LIFETIME_MESSAGES,
      remaining: FREE_LIFETIME_MESSAGES,
    };
  }

  if (isPro(row)) {
    const { data: usage } = await admin
      .from("chat_usage")
      .select("messages_used")
      .eq("user_id", userId)
      .eq("period_start", currentPeriodStart())
      .maybeSingle();

    const used = Number(usage?.messages_used ?? 0);
    return {
      tier: "pro",
      used,
      allowance: PRO_MONTHLY_MESSAGES,
      remaining: Math.max(0, PRO_MONTHLY_MESSAGES - used),
    };
  }

  const used = Number(row.lifetime_messages_used ?? 0);
  return {
    tier: "free",
    used,
    allowance: FREE_LIFETIME_MESSAGES,
    remaining: Math.max(0, FREE_LIFETIME_MESSAGES - used),
  };
}

export interface Spend extends Entitlement {
  /** False means the caller is out; show the paywall and call nothing. */
  allowed: boolean;
}

/**
 * Spend one message, if there is one to spend.
 *
 * Call this before the model, not after. Charging on success would mean a
 * request that fails halfway still cost real money and metered nothing, and
 * the failure mode that matters is the one where a loop keeps failing.
 *
 * The check and the increment happen together inside consume_chat_message,
 * under a row lock, because doing them here as a read and then a write loses
 * to a double tap: both requests see four used, both write five, and the fifth
 * and sixth messages are both free.
 */
export async function consumeMessage(userId: string): Promise<Spend> {
  const admin = createServiceClient();

  const { data, error } = await admin.rpc("consume_chat_message", {
    p_user_id: userId,
    p_free_lifetime: FREE_LIFETIME_MESSAGES,
    p_pro_monthly: PRO_MONTHLY_MESSAGES,
  });

  /*
   * Refuse when the meter is unreachable.
   *
   * The opposite default is the expensive one: if a broken meter waves
   * everybody through, the first thing that breaks the database is also the
   * thing that empties the account. One person seeing "try again shortly" is
   * the cheaper wrong answer, and it is honest, the meter really is down.
   */
  if (error) {
    console.error("chat meter unreachable", error);
    return {
      allowed: false,
      tier: "free",
      used: 0,
      allowance: FREE_LIFETIME_MESSAGES,
      remaining: 0,
    };
  }

  // The function returns a one-row table, which PostgREST hands back as an
  // array of one.
  const result = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; tier: Tier; used: number; allowance: number }
    | undefined;

  if (!result) {
    console.error("chat meter returned no row", { userId });
    return {
      allowed: false,
      tier: "free",
      used: 0,
      allowance: FREE_LIFETIME_MESSAGES,
      remaining: 0,
    };
  }

  return {
    allowed: Boolean(result.allowed),
    tier: result.tier,
    used: Number(result.used),
    allowance: Number(result.allowance),
    remaining: Math.max(0, Number(result.allowance) - Number(result.used)),
  };
}

/**
 * Grant or revoke pro by hand.
 *
 * How testers get access before there is anything to buy, and how a refund or
 * a goodwill month gets applied afterwards. Service role only, and there is
 * deliberately no route in front of it yet: until P3 the only way to become
 * pro is for a person with database access to decide so.
 */
export async function setTier(
  userId: string,
  tier: Tier,
  opts: { source?: "apple" | "stripe" | "grant"; expiresAt?: string | null } = {}
): Promise<void> {
  const admin = createServiceClient();

  const { error } = await admin.from("entitlements").upsert(
    {
      user_id: userId,
      tier,
      status: "active",
      source: tier === "pro" ? (opts.source ?? "grant") : null,
      expires_at: opts.expiresAt ?? null,
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(`could not set tier: ${error.message}`);
}

/** First of the current month, UTC, matching what the SQL function computes. */
function currentPeriodStart(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-01`;
}

function isPro(row: {
  tier: string | null;
  status: string | null;
  expires_at: string | null;
}): boolean {
  if (row.tier !== "pro") return false;
  // Grace is inside the gate on purpose: a card that failed to renew is a
  // billing problem to chase, not a reason to cut someone off mid-sentence.
  if (row.status !== "active" && row.status !== "in_grace") return false;
  return !row.expires_at || new Date(row.expires_at) > new Date();
}
