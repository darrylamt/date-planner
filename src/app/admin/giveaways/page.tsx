import { adminDataClient } from "@/lib/adminAuth";
import { GiveawayDrawButton } from "@/components/admin/GiveawayDrawButton";

export const dynamic = "force-dynamic";

/*
 * Ticket giveaways (0117): who has tried, who won and how. The winner's
 * page address is shown so the owner can send it on if the push is missed.
 */
type G = {
  id: string;
  event_id: string;
  prize: string;
  win_at_entry: number;
  draw_at: string;
  winner_user_id: string | null;
  winner_token: string | null;
  won_at: string | null;
  won_how: string | null;
  announced_at: string | null;
  events: { title: string; event_date: string } | null;
};

const at = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export default async function AdminGiveawaysPage() {
  const db = await adminDataClient();
  const { data, error } = await db
    .from("giveaways")
    .select("id, event_id, prize, win_at_entry, draw_at, winner_user_id, winner_token, won_at, won_how, announced_at, events(title, event_date)")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <h1 className="font-display text-[24px] font-bold">Giveaways</h1>
        <p className="mt-1 text-[14px] text-mutedbrown">This needs migration 0117.</p>
      </div>
    );
  }

  const list = (data ?? []) as unknown as G[];
  const counts = new Map<string, number>();
  const winners = new Map<string, string>();
  for (const g of list) {
    const { count } = await db.from("giveaway_entries").select("seq", { count: "exact", head: true }).eq("giveaway_id", g.id);
    counts.set(g.id, count ?? 0);
    if (g.winner_user_id) {
      const { data: p } = await db.from("profiles").select("email, display_name").eq("id", g.winner_user_id).maybeSingle();
      const who = p as { email: string | null; display_name: string | null } | null;
      winners.set(g.id, [who?.display_name, who?.email].filter(Boolean).join(", ") || g.winner_user_id);
    }
  }

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold">Giveaways</h1>
      <p className="mt-1 max-w-[680px] text-[14px] text-mutedbrown">
        Signed-in people with notifications on enter by tapping the event&apos;s Tickets button in the app. The person
        whose entry hits the number below wins. If not enough people try by the draw time, one of them is drawn. Everyone
        who tried is told who won.
      </p>
      <div className="mt-6 grid gap-4">
        {list.length ? (
          list.map((g) => (
            <div key={g.id} className="rounded-card border border-line p-4">
              <div className="text-[17px] font-bold">{g.events?.title ?? g.prize}</div>
              <div className="mt-1 grid gap-0.5 text-[14px] text-cocoa">
                <div>
                  Tried so far: <b>{counts.get(g.id)}</b>. Entry number {g.win_at_entry} wins. Draw at {at(g.draw_at)} (Accra) if
                  nobody has.
                </div>
                {g.winner_user_id ? (
                  <>
                    <div>
                      Winner: <b>{winners.get(g.id)}</b>, {g.won_how === "draw" ? "drawn" : `entry ${g.win_at_entry}`} at {at(g.won_at)}.{" "}
                      {g.announced_at ? "Everyone who tried has been told." : "Not announced yet."}
                    </div>
                    {g.winner_token ? (
                      <div className="break-all text-[13px] text-mutedbrown">Their ticket page: /win/{g.winner_token}</div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-2">
                    <GiveawayDrawButton eventId={g.event_id} entries={counts.get(g.id) ?? 0} />
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-mutedbrown">No giveaways yet.</p>
        )}
      </div>
    </div>
  );
}
