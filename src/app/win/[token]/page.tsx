import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WinnerTicket } from "@/components/shared/WinnerTicket";
import { createFreshServiceClient } from "@/lib/supabase/server";
import { longDate, time12 } from "@/lib/format";

/*
 * The winner's ticket (0117). The address holds a long random token and is
 * only ever given to the winner: in the app the moment they win, and in the
 * push that tells them. Never indexed, never cached.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You won! | Duro!",
  robots: { index: false, follow: false },
};

type Ev = { title: string; event_date: string; start_time: string | null; venues: { name: string; areas: { name: string } | null } | null };

export default async function WinnerPage({ params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(params.token)) notFound();
  const db = createFreshServiceClient();
  const { data: g } = await db
    .from("giveaways")
    .select("prize, prize_qr, event_id")
    .eq("winner_token", params.token)
    .maybeSingle();
  if (!g) notFound();
  const { data: e } = await db
    .from("events")
    .select("title, event_date, start_time, venues(name, areas(name))")
    .eq("id", g.event_id)
    .maybeSingle();
  const ev = e as unknown as Ev | null;

  return (
    <WinnerTicket
      token={params.token}
      prize={g.prize}
      qr={g.prize_qr}
      title={ev?.title ?? null}
      when={ev ? [longDate(ev.event_date), ev.start_time ? time12(ev.start_time) : null].filter(Boolean).join(", ") : null}
      where={ev?.venues ? [ev.venues.name, ev.venues.areas?.name].filter(Boolean).join(", ") : null}
    />
  );
}
