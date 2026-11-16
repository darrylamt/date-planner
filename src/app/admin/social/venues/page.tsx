import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { listedMenus, menuUrl } from "@/lib/menuPage";
import { createCatalogClient } from "@/lib/supabase/server";
import { tidyName } from "@/lib/nudges";
import { OutreachRow, type OutreachVenue } from "./OutreachRow";

export const dynamic = "force-dynamic";

/*
 * Admin → Social → Venue outreach (owner, 16 Nov 2026; growth idea 4): get
 * venues sharing Duro! with their own followers. Each venue is offered three
 * months of Portal Pro, free, for putting its Duro! menu link in its bio and
 * reposting a Duro! flyer that tags it once a month. The owner turns Portal
 * Pro on by hand once a venue has agreed.
 *
 * The list: venues with an Instagram account and a menu on Duro!, the ones
 * people keep in their plans first. Each row has the message to send, its
 * menu link, a flyer one tap away, and where the conversation is.
 */
export default async function OutreachPage({ searchParams }: { searchParams: { show?: string } }) {
  const db = await adminDataClient(["social"]);
  type V = { id: string; name: string; instagram_handle: string | null; menu_shared_from: string | null; areas: { name: string } | null };
  const venues = await fetchAllRows<V>((a, b) =>
    db
      .from("venues")
      .select("id, name, instagram_handle, menu_shared_from, areas(name)")
      .eq("is_active", true)
      .in("type", ["restaurant", "lounge", "cafe", "activity"])
      .not("instagram_handle", "is", null)
      .order("id")
      .range(a, b) as never
  );
  const pull = await fetchAllRows<{ venue_id: string; effect: number }>((a, b) => db.from("venue_pull").select("venue_id, effect").order("venue_id").range(a, b) as never);
  const pullOf = new Map(pull.map((p) => [p.venue_id, Number(p.effect) || 0]));
  // Venues with a menu page, read through the catalogue client: kept in memory a few minutes and shared with plan-making.
  const withMenu = new Set((await listedMenus(createCatalogClient())).map((m) => m.id));
  const { data: rows, error } = await db.from("venue_outreach").select("venue_id, status, notes, updated_at");
  const state = new Map(((rows ?? []) as { venue_id: string; status: string; notes: string | null; updated_at: string }[]).map((r) => [r.venue_id, r]));

  const list: OutreachVenue[] = venues
    .filter((v) => withMenu.has(v.id) && (v.instagram_handle ?? "").trim())
    .map((v) => {
      const s = state.get(v.id);
      return {
        id: v.id,
        name: tidyName(v.name),
        area: v.areas?.name ?? null,
        instagram: v.instagram_handle!.replace(/^@/, "").trim(),
        menu: menuUrl(v.id, v.name, v.areas?.name),
        status: (s?.status ?? "todo") as OutreachVenue["status"],
        notes: s?.notes ?? "",
        pull: pullOf.get(v.id) ?? 0,
      };
    })
    .sort((a, b) => b.pull - a.pull || a.name.localeCompare(b.name));

  const show = searchParams.show ?? "todo";
  const counts = list.reduce<Record<string, number>>((m, v) => ((m[v.status] = (m[v.status] ?? 0) + 1), m), {});
  const shown = show === "all" ? list : list.filter((v) => v.status === show);
  const tabs: [string, string][] = [
    ["todo", "To ask"],
    ["messaged", "Messaged"],
    ["agreed", "Agreed"],
    ["posting", "Posting"],
    ["declined", "Declined"],
    ["all", "All"],
  ];

  return (
    <div className="max-w-[1100px]">
      <h1>Venue outreach</h1>
      <p className="mt-1 max-w-[780px] text-[14px] text-mutedbrown">
        Get places sharing Duro! with their own followers. The offer: <strong>three months of Portal Pro free</strong> if they put their Duro! menu link in
        their Instagram bio and repost a Duro! flyer that tags them once a month. Send the message from Duro!&apos;s Instagram, attach a flyer, and mark
        where it stands. When a place agrees, tell Darryl so he can turn Portal Pro on.
      </p>
      {error ? <div className="card mt-4 p-4 text-[14px]">The outreach list needs migration 0116 before statuses can be saved.</div> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Link key={id} href={`/admin/social/venues?show=${id}`} className={show === id ? "btn btnsm" : "btn2 btnsm"}>
            {label} {id === "all" ? list.length : counts[id] ?? 0}
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-3">
        {shown.length ? shown.map((v) => <OutreachRow key={v.id} venue={v} />) : <div className="card p-5 text-[14px]">None here.</div>}
      </div>
    </div>
  );
}
