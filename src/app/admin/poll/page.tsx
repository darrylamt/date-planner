import { adminDataClient } from "@/lib/adminAuth";
import { fetchAllRows } from "@/lib/fetchAll";
import { NAME_OPTIONS, cleanName, nameKey } from "@/lib/namePoll";
import { PollHideButton } from "@/components/admin/PollHideButton";

export const dynamic = "force-dynamic";

interface Vote {
  created_at: string;
  choice: string;
  other_name: string | null;
  suggestion: string | null;
}

/** The name poll: the count, the names people typed, and what they want from the app. */
export default async function AdminPollPage() {
  const supabase = await adminDataClient();
  let votes: Vote[] = [];
  let missing = false;
  try {
    votes = await fetchAllRows<Vote>((a, b) =>
      supabase.from("name_poll_votes").select("created_at, choice, other_name, suggestion").order("created_at", { ascending: false }).range(a, b)
    );
  } catch {
    missing = true;
  }
  const { data: hiddenRows } = await supabase.from("name_poll_hidden").select("name_key");
  const hidden = new Set((hiddenRows ?? []).map((h: { name_key: string }) => h.name_key));

  const total = votes.length;
  const byChoice = NAME_OPTIONS.map((o) => ({ ...o, n: votes.filter((v) => v.choice === o.id).length })).sort((a, b) => b.n - a.n);
  const others = new Map<string, { name: string; n: number }>();
  for (const v of votes) {
    if (v.choice !== "Other" || !v.other_name) continue;
    const key = nameKey(v.other_name);
    const cur = others.get(key) ?? { name: cleanName(v.other_name), n: 0 };
    cur.n++;
    others.set(key, cur);
  }
  const suggestions = votes.filter((v) => v.suggestion?.trim());

  return (
    <div className="max-w-[900px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold">Name poll</h1>
        <a href="/name" target="_blank" className="btn2 btnsm px-5">
          Open the poll ↗
        </a>
      </div>
      <p className="mt-1 text-[14px] text-mutedbrown">
        Votes from the public poll at /name. One device can vote up to three times a day.
      </p>

      {missing ? (
        <div className="card mt-5 p-5 text-[14px]">
          Run migration <b>0066_name_poll.sql</b> first.
        </div>
      ) : (
        <>
          <div className="card mt-5 p-5">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-mutedbrown">{total} votes</div>
            <ul className="mt-3 grid gap-2.5">
              {byChoice.map((o) => (
                <li key={o.id} className="flex items-center gap-3 text-[14px]">
                  <span className="w-[110px] font-bold">
                    {o.emoji} {o.id}
                  </span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-black/10">
                    <span
                      className="block h-3 rounded-full"
                      style={{ width: `${total ? (100 * o.n) / total : 0}%`, background: `linear-gradient(90deg, ${o.color}, ${o.color2})` }}
                    />
                  </span>
                  <span className="w-20 text-right font-mono">
                    {o.n} ({total ? Math.round((100 * o.n) / total) : 0}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-1 text-[16px] font-bold">Names voters suggested</h2>
              <p className="mb-3 text-[12px] text-mutedbrown">
                Each shows in the public poll for others to vote for. Hide one that should not be there; its votes are kept.
              </p>
              {others.size ? (
                <ul className="grid gap-1.5 text-[14px]">
                  {[...others.values()]
                    .sort((a, b) => b.n - a.n)
                    .map((o) => {
                      const off = hidden.has(nameKey(o.name));
                      return (
                        <li key={o.name} className={`flex items-center justify-between ${off ? "opacity-50" : ""}`}>
                          <span>
                            {o.name}
                            {off ? <span className="ml-2 text-[12px] text-mutedbrown">hidden</span> : null}
                          </span>
                          <span className="flex items-center">
                            <span className="font-mono text-mutedbrown">{o.n}</span>
                            <PollHideButton name={o.name} hidden={off} />
                          </span>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="text-[13px] text-mutedbrown">None yet.</p>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-3 text-[16px] font-bold">Suggestions for the app ({suggestions.length})</h2>
              {suggestions.length ? (
                <ul className="grid max-h-[520px] gap-3 overflow-y-auto text-[14px]">
                  {suggestions.map((v, i) => (
                    <li key={i} className="border-b border-line pb-2">
                      <div>{v.suggestion}</div>
                      <div className="mt-1 text-[12px] text-mutedbrown">
                        {new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · voted{" "}
                        {v.choice === "Other" ? v.other_name : v.choice}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-mutedbrown">None yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
