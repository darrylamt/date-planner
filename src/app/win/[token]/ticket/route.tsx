import { createFreshServiceClient } from "@/lib/supabase/server";
import { longDate, time12 } from "@/lib/format";
import { renderTicketImage } from "@/lib/ticketImage";

/* "Save the ticket" on the winner's page (0117): their ticket as a picture. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(params.token)) return new Response("Not found", { status: 404 });
  const db = createFreshServiceClient();
  const { data: g } = await db.from("giveaways").select("prize_qr, event_id").eq("winner_token", params.token).maybeSingle();
  if (!g) return new Response("Not found", { status: 404 });
  const { data: e } = await db
    .from("events")
    .select("title, event_date, start_time, venues(name)")
    .eq("id", g.event_id)
    .maybeSingle();
  const ev = e as unknown as { title: string; event_date: string; start_time: string | null; venues: { name: string } | null } | null;
  return renderTicketImage(
    {
      qr: g.prize_qr as string,
      title: ev?.title ?? null,
      when: ev ? [longDate(ev.event_date), ev.start_time ? time12(ev.start_time) : null].filter(Boolean).join(", ") : null,
      venue: ev?.venues?.name ?? null,
    },
    new URL(req.url).origin,
  );
}
