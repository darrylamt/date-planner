import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPush, tokensForUsers, type PushMessage } from "@/lib/pushServer";
import { SITE_URL } from "@/lib/site";

/*
 * Ticket giveaways (0117, owner 20 Nov 2026).
 *
 * The event's ticket link becomes duroplans.com/win/e/<event id>. The app
 * recognises it (mobile/src/lib/giveaway.ts) and, for somebody signed in with
 * notifications on, enters them before opening anything: the Nth to enter
 * (win_at_entry) is sent to their ticket page, everyone else to the normal
 * ticket page, exactly as before. Fewer than N by draw_at and one of those
 * who tried is drawn instead. Once it is won, everyone who tried hears who
 * won by push, the winner's email masked.
 *
 * One chance each: a second tap from the same account is not a new entry.
 * Admin accounts are never entered, so testing it uses up nobody's place.
 */

export type Giveaway = {
  id: string;
  event_id: string;
  prize: string;
  prize_qr: string;
  fallback_url: string;
  win_at_entry: number;
  draw_at: string;
  winner_user_id: string | null;
  winner_token: string | null;
  won_at: string | null;
  won_how: "entry" | "draw" | null;
  announced_at: string | null;
};

const COLUMNS =
  "id, event_id, prize, prize_qr, fallback_url, win_at_entry, draw_at, winner_user_id, winner_token, won_at, won_how, announced_at";

/** The giveaway on this event, newest first; null when there is none. */
export async function giveawayFor(db: SupabaseClient, eventId: string): Promise<Giveaway | null> {
  const { data } = await db
    .from("giveaways")
    .select(COLUMNS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Giveaway | null) ?? null;
}

export const winnerUrl = (token: string) => `${SITE_URL}/win/${token}`;

async function isAdmin(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin);
}

/**
 * Make this person the winner, unless somebody already is. One UPDATE with
 * "winner is still empty" in its WHERE, so two at once can never both win.
 */
async function claim(db: SupabaseClient, g: Giveaway, userId: string, how: "entry" | "draw"): Promise<Giveaway | null> {
  const { data } = await db
    .from("giveaways")
    .update({
      winner_user_id: userId,
      winner_token: randomBytes(18).toString("base64url"),
      won_at: new Date().toISOString(),
      won_how: how,
    })
    .eq("id", g.id)
    .is("winner_user_id", null)
    .select(COLUMNS)
    .maybeSingle();
  return (data as Giveaway | null) ?? null;
}

export type EnterResult = {
  status: "won" | "entered" | "tried-before" | "closed" | "admin";
  url: string;
};

/** One tap on Tickets from somebody who may enter (signed in, notifications on). */
export async function enterGiveaway(db: SupabaseClient, g: Giveaway, userId: string, now = new Date()): Promise<EnterResult> {
  const lost = (status: EnterResult["status"]): EnterResult => ({ status, url: g.fallback_url });

  if (g.winner_user_id) {
    return g.winner_user_id === userId && g.winner_token ? { status: "won", url: winnerUrl(g.winner_token) } : lost("closed");
  }
  if (await isAdmin(db, userId)) return lost("admin");

  // Past the draw time nobody new enters; the draw happens now if the cron has not run it.
  if (new Date(g.draw_at) <= now) {
    const drawn = await drawOne(db, g);
    return drawn?.winner_user_id === userId && drawn.winner_token ? { status: "won", url: winnerUrl(drawn.winner_token) } : lost("closed");
  }

  const { data: entry, error } = await db
    .from("giveaway_entries")
    .insert({ giveaway_id: g.id, user_id: userId })
    .select("seq")
    .single();
  if (error) {
    // 23505: this account has entered already. One chance each.
    return lost(error.code === "23505" ? "tried-before" : "entered");
  }

  // Where this entry came in: entries on this giveaway up to and including it.
  const { count } = await db
    .from("giveaway_entries")
    .select("seq", { count: "exact", head: true })
    .eq("giveaway_id", g.id)
    .lte("seq", (entry as { seq: number }).seq);

  // ">=" rather than "===": if the Nth tap failed half-way, the next one still wins.
  if ((count ?? 0) >= g.win_at_entry) {
    const won = await claim(db, g, userId, "entry");
    if (won?.winner_token) {
      await announce(db, won).catch(() => undefined);
      return { status: "won", url: winnerUrl(won.winner_token) };
    }
  }
  return lost("entered");
}

/**
 * A plan made by a signed-in account enters it into every open giveaway
 * (owner, 20 Nov 2026: the Tickets tap needed an app update most phones had
 * not loaded, so "anyone who creates a plan before 9pm" is in). No instant
 * win here: these are drawn at draw_at. A plan made after the draw time
 * draws any giveaway that is due, so the draw never waits on the cron.
 */
export async function enterFromPlan(db: SupabaseClient, userId: string, now = new Date()): Promise<void> {
  await drawDue(db, now);
  const { data } = await db.from("giveaways").select("id").is("winner_user_id", null).gt("draw_at", now.toISOString());
  const open = ((data ?? []) as { id: string }[]).map((g) => g.id);
  if (!open.length || (await isAdmin(db, userId))) return;
  await db
    .from("giveaway_entries")
    .upsert(open.map((giveaway_id) => ({ giveaway_id, user_id: userId })), { onConflict: "giveaway_id,user_id", ignoreDuplicates: true });
}

/** Draw one of those who tried, if nobody has won yet. Returns the giveaway as it now stands. */
export async function drawOne(db: SupabaseClient, g: Giveaway): Promise<Giveaway | null> {
  if (g.winner_user_id) return g;
  const { data } = await db.from("giveaway_entries").select("user_id").eq("giveaway_id", g.id);
  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (!ids.length) return g;
  const pick = ids[randomBytes(4).readUInt32BE(0) % ids.length];
  const won = await claim(db, g, pick, "draw");
  if (!won) return giveawayFor(db, g.event_id); // somebody won in the meantime
  await announce(db, won).catch(() => undefined);
  return won;
}

/** Every giveaway past its draw time with no winner yet (the 19:00 cron). */
export async function drawDue(db: SupabaseClient, now = new Date()) {
  const { data } = await db.from("giveaways").select(COLUMNS).is("winner_user_id", null).lte("draw_at", now.toISOString());
  const out: { id: string; winner: string | null; entries: string }[] = [];
  for (const g of (data ?? []) as Giveaway[]) {
    const after = await drawOne(db, g);
    out.push({ id: g.id, winner: after?.winner_user_id ?? null, entries: after?.winner_user_id ? "drawn" : "nobody entered" });
  }
  return out;
}

/**
 * "A****56@gmail.com". An Apple private-relay address says nothing, masked
 * or not, so those show the first name and an initial instead.
 */
export function maskWinner(email: string | null, displayName: string | null): string {
  const [local, domain] = (email ?? "").split("@");
  if (local && domain && !/privaterelay\.appleid\.com$/i.test(domain)) {
    const head = local[0].toUpperCase();
    const tail = local.length > 4 ? local.slice(-2) : "";
    return `${head}****${tail}@${domain}`;
  }
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length) return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  return "Someone who signs in with Apple";
}

/**
 * Tell the winner, and everyone else who tried, once. announced_at is
 * claimed first so a retry, the cron and a tap at once cannot send it twice.
 */
export async function announce(db: SupabaseClient, g: Giveaway): Promise<{ sent: number; failures: string[] } | null> {
  if (!g.winner_user_id || !g.winner_token) return null;
  const { data: mine } = await db
    .from("giveaways")
    .update({ announced_at: new Date().toISOString() })
    .eq("id", g.id)
    .is("announced_at", null)
    .select("id")
    .maybeSingle();
  if (!mine) return null;

  const { data: who } = await db.from("profiles").select("email, display_name").eq("id", g.winner_user_id).maybeSingle();
  const w = who as { email: string | null; display_name: string | null } | null;
  const name = maskWinner(w?.email ?? null, w?.display_name ?? null);

  const { data: entries } = await db.from("giveaway_entries").select("user_id").eq("giveaway_id", g.id);
  const others = ((entries ?? []) as { user_id: string }[]).map((e) => e.user_id).filter((id) => id !== g.winner_user_id);
  const tokens = await tokensForUsers(db, [g.winner_user_id, ...others]);

  const messages: PushMessage[] = [];
  for (const to of tokens.get(g.winner_user_id) ?? []) {
    messages.push({
      to,
      title: "You won! 🎉",
      body: `You've won ${g.prize}. Tap to open your ticket, then screenshot it for the gate.`,
      data: { url: `/win/${g.winner_token}` },
    });
  }
  for (const id of others) {
    for (const to of tokens.get(id) ?? []) {
      messages.push({
        to,
        title: "We have a winner 🎟️",
        body: `${name} won ${g.prize}. Thanks for playing, and keep planning: there'll be more.`,
        data: { url: "/events" },
      });
    }
  }
  return sendExpoPush(messages);
}

/** The ticket's own modules ("0101…,0110…") as a crisp SVG, quiet zone included. */
export function qrSvg(rows: string, px = 10): string {
  const grid = rows.split(",");
  const n = grid.length;
  const q = 4;
  const size = (n + q * 2) * px;
  let rects = "";
  grid.forEach((row, r) =>
    [...row].forEach((bit, c) => {
      if (bit === "1") rects += `<rect x="${(c + q) * px}" y="${(r + q) * px}" width="${px}" height="${px}"/>`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
