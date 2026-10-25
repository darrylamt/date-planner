import Link from "next/link";
import { adminDataClient } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type Edit = {
  id: number;
  created_at: string;
  user_id: string | null;
  table_name: string;
  row_id: string;
  venue_id: string | null;
  action: "insert" | "update" | "delete";
  changes: Record<string, unknown>;
};

const WHAT: Record<string, string> = {
  venues: "venue",
  menu_items: "dish",
  events: "event",
  gaderin_activities: "Gaderin listing",
};

/** Fields worth naming in a one-line summary of a new or removed row. */
const TITLE_KEYS = ["name", "title", "slug"];

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "empty";
  if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? "" : "s"}` : "none";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

/**
 * Every change a staff login made (staff_edits, 0095), newest first: who,
 * which venue, what it was and what it became. Filter by person or venue.
 */
export default async function TeamActivityPage({ searchParams }: { searchParams: { user?: string; venue?: string } }) {
  const supabase = await adminDataClient();
  let q = supabase.from("staff_edits").select("*").order("created_at", { ascending: false }).limit(300);
  if (searchParams.user) q = q.eq("user_id", searchParams.user);
  if (searchParams.venue) q = q.eq("venue_id", searchParams.venue);
  const [{ data, error }, { data: roles }] = await Promise.all([q, supabase.from("staff_roles").select("user_id, username")]);

  if (error) {
    return (
      <div>
        <h1>Activity</h1>
        <div className="why mt-4">The activity log needs migration 0095.</div>
      </div>
    );
  }

  const edits = (data ?? []) as Edit[];
  const ids = [...new Set(edits.map((e) => e.venue_id).filter(Boolean))] as string[];
  const { data: venues } = ids.length ? await supabase.from("venues").select("id, name").in("id", ids) : { data: [] };
  const venueName = new Map(((venues ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name]));
  const who = new Map(((roles ?? []) as { user_id: string; username: string | null }[]).map((r) => [r.user_id, r.username ?? "?"]));

  return (
    <div>
      <Link href="/admin/team" className="text-[13px] text-mutedbrown hover:underline">
        ← Team
      </Link>
      <h1 className="mt-2">Activity</h1>
      <p className="text-[14px] text-mutedbrown">
        Changes made by staff logins, newest first
        {searchParams.user ? ` · ${who.get(searchParams.user) ?? "one person"}` : ""}
        {searchParams.venue ? ` · ${venueName.get(searchParams.venue) ?? "one venue"}` : ""}.{" "}
        {searchParams.user || searchParams.venue ? (
          <Link href="/admin/team/activity" className="underline">
            Show everything
          </Link>
        ) : null}
      </p>

      {edits.length === 0 ? (
        <div className="why mt-4">Nothing yet.</div>
      ) : (
        <div className="card mt-4 overflow-x-auto p-0">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Where</th>
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {edits.map((e) => {
                const title = TITLE_KEYS.map((k) => e.changes?.[k]).find((x) => typeof x === "string") as string | undefined;
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap align-top tabular-nums text-mutedbrown">
                      {new Date(e.created_at).toLocaleString("en-GB", {
                        timeZone: "Africa/Accra",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="align-top">
                      {e.user_id ? (
                        <Link href={`/admin/team/activity?user=${e.user_id}`} className="hover:underline">
                          {who.get(e.user_id) ?? "removed login"}
                        </Link>
                      ) : (
                        "?"
                      )}
                    </td>
                    <td className="align-top">
                      {e.venue_id ? (
                        <Link href={`/admin/team/activity?venue=${e.venue_id}`} className="font-semibold hover:underline">
                          {venueName.get(e.venue_id) ?? "a venue"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="align-top">
                      {e.action === "update" ? (
                        <ul className="grid gap-0.5">
                          {Object.entries(e.changes ?? {}).map(([k, pair]) => {
                            const [before, after] = Array.isArray(pair) && pair.length === 2 ? pair : [undefined, pair];
                            return (
                              <li key={k} className="text-[13px]">
                                <span className="font-semibold">{k.replace(/_/g, " ")}</span>{" "}
                                <span className="text-mutedbrown">{show(before)}</span> → <span>{show(after)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <span className="text-[13px]">
                          {e.action === "insert" ? "Added" : "Removed"} {WHAT[e.table_name] ?? e.table_name}
                          {title ? `: ${title}` : ""}
                          {e.table_name === "menu_items" && e.changes?.price_ghs != null ? ` (GHS ${e.changes.price_ghs})` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
