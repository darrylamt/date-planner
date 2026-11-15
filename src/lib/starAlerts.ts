import type { SupabaseClient } from "@supabase/supabase-js";
import { fold } from "./fold";
import { tidyName } from "./nudges";
import { sendExpoPush, tokensForUsers, type PushMessage } from "./pushServer";
import { longDate } from "./format";

/*
 * Star alerts (0113, Pro): once a day, a person who turned them on is told
 * when a place they starred adds an event or new dishes, or changes a price.
 *
 * Neither events nor dishes record when they were added, so the job keeps
 * its own note of what each watched place had (star_watch_seen) and anything
 * not in it is news. A place watched for the first time is noted silently:
 * what it already had is not news. Dishes are known by name, not row id, so
 * a menu read in again from a photo is not a page of "new" dishes.
 *
 * One push a day at most, claimed (star_alert_sends) before it is sent.
 */

export interface StarAlert {
  title: string;
  body: string;
  url: string;
}

export interface StarAlertRun {
  watching: number;
  venues: number;
  baselined: number;
  messages: { userId: string; alert: StarAlert }[];
  skipped: Record<string, number>;
  sent?: number;
  failures?: string[];
}

type News = { venueId: string; venue: string; line: string; rank: number };

const ghs = (n: number) => `GHS ${Math.round(n).toLocaleString("en-GB")}`;

/** What is new at each watched place since it was last looked at; notes it all as seen unless dry. */
async function newsByVenue(db: SupabaseClient, venueIds: string[], today: string, dry: boolean, closedToo = false) {
  const news = new Map<string, News[]>();
  let baselined = 0;
  for (let i = 0; i < venueIds.length; i += 100) {
    const ids = venueIds.slice(i, i + 100);
    const [{ data: seenRows }, { data: venues }, { data: events }, { data: dishes }] = await Promise.all([
      db.from("star_watch_seen").select("venue_id, kind, key, value").in("venue_id", ids).limit(50_000),
      db.from("venues").select("id, name, is_active").in("id", ids),
      db.from("events").select("venue_id, title, event_date, start_time").in("venue_id", ids).eq("is_active", true).gte("event_date", today).limit(5000),
      db.from("menu_items").select("venue_id, name, price_ghs").in("venue_id", ids).limit(50_000),
    ]);
    // "venue:kind:key" to the value noted with it.
    const seen = new Map<string, string | null>();
    for (const r of (seenRows ?? []) as { venue_id: string; kind: string; key: string; value: string | null }[]) seen.set(`${r.venue_id}:${r.kind}:${r.key}`, r.value);
    const has = (v: string, kind: string, key: string) => seen.has(`${v}:${kind}:${key}`);
    const valueOf = (v: string, kind: string, key: string) => seen.get(`${v}:${kind}:${key}`) ?? null;
    const name = new Map(((venues ?? []) as { id: string; name: string; is_active: boolean }[]).filter((v) => v.is_active || closedToo).map((v) => [v.id, tidyName(v.name)]));

    const writes: { venue_id: string; kind: string; key: string; value: string | null }[] = [];
    for (const id of ids) {
      if (!name.has(id)) continue;
      const first = !has(id, "watch", "");
      if (first) {
        writes.push({ venue_id: id, kind: "watch", key: "", value: null });
        baselined++;
      }
      const found: News[] = [];
      for (const e of ((events ?? []) as { venue_id: string; title: string; event_date: string; start_time: string | null }[]).filter((x) => x.venue_id === id)) {
        const key = `${fold(e.title)}|${e.event_date}`;
        if (has(id, "event", key)) continue;
        writes.push({ venue_id: id, kind: "event", key, value: null });
        if (!first) found.push({ venueId: id, venue: name.get(id)!, line: `${tidyName(e.title)}, ${longDate(e.event_date)}`, rank: 3 });
      }
      const newDishes: string[] = [];
      const repriced: string[] = [];
      const byName = new Map<string, { name: string; price: number }>();
      for (const d of ((dishes ?? []) as { venue_id: string; name: string; price_ghs: number | string | null }[]).filter((x) => x.venue_id === id)) {
        if (d.price_ghs == null) continue;
        byName.set(fold(d.name), { name: d.name, price: Number(d.price_ghs) });
      }
      for (const [key, d] of byName) {
        const price = String(d.price);
        if (!has(id, "dish", key)) {
          writes.push({ venue_id: id, kind: "dish", key, value: price });
          if (!first) newDishes.push(`${d.name} (${ghs(d.price)})`);
        } else if (valueOf(id, "dish", key) !== price) {
          const was = Number(valueOf(id, "dish", key));
          writes.push({ venue_id: id, kind: "dish", key, value: price });
          if (!first && Number.isFinite(was)) repriced.push(`${d.name} ${ghs(was)} → ${ghs(d.price)}`);
        }
      }
      if (newDishes.length) {
        found.push({
          venueId: id,
          venue: name.get(id)!,
          line: newDishes.length > 2 ? `${newDishes.length} new dishes, like ${newDishes.slice(0, 2).join(" and ")}` : `new: ${newDishes.join(" and ")}`,
          rank: 2,
        });
      }
      if (repriced.length) {
        found.push({
          venueId: id,
          venue: name.get(id)!,
          line: repriced.length > 2 ? `${repriced.length} prices changed, like ${repriced[0]}` : `price change: ${repriced.join(", ")}`,
          rank: 1,
        });
      }
      if (found.length) news.set(id, found);
    }
    if (!dry) {
      for (let j = 0; j < writes.length; j += 500) {
        await db.from("star_watch_seen").upsert(writes.slice(j, j + 500), { onConflict: "venue_id,kind,key" });
      }
    }
  }
  return { news, baselined };
}

/** One person's alert from what is new at their starred places. */
export function alertFor(items: News[]): StarAlert | null {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => b.rank - a.rank);
  const places = [...new Set(sorted.map((n) => n.venueId))];
  if (places.length === 1) {
    const top = sorted[0];
    return {
      title: `${top.venue} ⭐`,
      body: sorted
        .slice(0, 2)
        .map((n) => n.line.charAt(0).toUpperCase() + n.line.slice(1))
        .join(". "),
      url: `/venue/${top.venueId}`,
    };
  }
  const first = sorted[0];
  return {
    title: `News from ${places.length} of your starred places ⭐`,
    body: `${first.venue}: ${first.line}. And more from ${sorted.find((n) => n.venueId !== first.venueId)!.venue}${places.length > 2 ? " and others" : ""}.`,
    url: "/saved?view=starred",
  };
}

/**
 * `users` limits the run to those accounts (the smoke test's own), so a test
 * never alerts anybody real; `closedToo` lets it watch the switched-off Duro
 * Test Kitchen. A closed place is otherwise never news.
 */
export async function runStarAlerts(db: SupabaseClient, now: Date, opts: { dry?: boolean; users?: string[]; closedToo?: boolean } = {}): Promise<StarAlertRun> {
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);
  const run: StarAlertRun = { watching: 0, venues: 0, baselined: 0, messages: [], skipped };

  let q = db.from("notification_prefs").select("user_id").eq("star_alerts", true);
  if (opts.users) q = q.in("user_id", opts.users);
  const { data: prefs, error } = await q;
  if (error) return { ...run, skipped: { "star_alerts missing (run 0113)": 1 } };
  const asked = ((prefs ?? []) as { user_id: string }[]).map((p) => p.user_id);
  if (!asked.length) return run;

  // Pro now, by the same rule as entitlements.ts isPro.
  const { data: ents } = await db.from("entitlements").select("user_id, tier, status, expires_at").in("user_id", asked);
  const pro = new Set(
    ((ents ?? []) as { user_id: string; tier: string; status: string; expires_at: string | null }[])
      .filter((e) => e.tier === "pro" && ["active", "in_grace"].includes(e.status) && (!e.expires_at || Date.parse(e.expires_at) > now.getTime()))
      .map((e) => e.user_id)
  );
  const users = asked.filter((u) => pro.has(u));
  if (asked.length > users.length) skipped["not Pro"] = asked.length - users.length;
  run.watching = users.length;
  if (!users.length) return run;

  const { data: starRows } = await db.from("venue_stars").select("user_id, venue_id").in("user_id", users).limit(50_000);
  const stars = (starRows ?? []) as { user_id: string; venue_id: string }[];
  const venueIds = [...new Set(stars.map((s) => s.venue_id))];
  run.venues = venueIds.length;
  if (!venueIds.length) return run;

  const today = now.toISOString().slice(0, 10);
  const { news, baselined } = await newsByVenue(db, venueIds, today, Boolean(opts.dry), Boolean(opts.closedToo));
  run.baselined = baselined;

  const tokens = await tokensForUsers(db, users);
  const { data: sentRows } = await db.from("star_alert_sends").select("user_id").in("user_id", users).eq("period", today);
  const sentToday = new Set(((sentRows ?? []) as { user_id: string }[]).map((r) => r.user_id));
  for (const userId of users) {
    if (sentToday.has(userId)) {
      skip("already alerted today");
      continue;
    }
    if (!(tokens.get(userId) ?? []).length) {
      skip("no device");
      continue;
    }
    const mine = stars.filter((s) => s.user_id === userId).flatMap((s) => news.get(s.venue_id) ?? []);
    const alert = alertFor(mine);
    if (!alert) {
      skip("nothing new");
      continue;
    }
    run.messages.push({ userId, alert });
  }
  if (opts.dry) return run;

  const out: PushMessage[] = [];
  const claimed: { userId: string; devices: number }[] = [];
  for (const { userId, alert } of run.messages) {
    const { error: claim } = await db.from("star_alert_sends").insert({ user_id: userId, period: today, title: alert.title, body: alert.body, url: alert.url });
    if (claim) {
      skip("claimed elsewhere");
      continue;
    }
    const devices = tokens.get(userId) ?? [];
    for (const to of devices) out.push({ to, title: alert.title, body: alert.body, data: { url: alert.url } });
    claimed.push({ userId, devices: devices.length });
  }
  const { sent, failures } = await sendExpoPush(out);
  for (const c of claimed) await db.from("star_alert_sends").update({ delivered: c.devices }).eq("user_id", c.userId).eq("period", today);
  return { ...run, sent, failures };
}

