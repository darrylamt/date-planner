"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CUISINE_KINDS } from "@/lib/catalog";
import { Toast } from "@/components/Toast";
import { Pager, SearchBox, usePagedRows } from "./TableControls";

/**
 * Every venue's kitchen, on one screen.
 *
 * A hundred and forty-two venues have no kitchen recorded, and the rules
 * cannot help with them: Pomona is Italian and nothing in the word "Pomona"
 * says so. Somebody has to know, and the only question is how much work it
 * takes them to say it.
 *
 * Opening a venue form each time is roughly six actions per venue and a page
 * load either side. Here it is one click. The common kitchens are buttons
 * because most venues are one of a dozen things, and the box underneath takes
 * anything else, since Accra will grow a kitchen this list has not thought of.
 *
 * Saves on the spot rather than behind a Save All: a screen of a hundred and
 * forty-two rows with one button at the bottom is a screen you lose work on.
 */
interface Row {
  id: string;
  name: string;
  area: string;
  type: string;
  cuisine: string | null;
  cuisines: string[];
}

/** Offered as buttons. The rest of the vocabulary is still typeable. */
const COMMON = [
  "ghanaian",
  "west african",
  "continental",
  "italian",
  "lebanese",
  "chinese",
  "indian",
  "japanese",
  "american",
  "grill",
  "seafood",
  "bakery",
  "coffee",
] as const;

export function KitchenEditor({ rows }: { rows: Row[] }) {
  const supabase = createClient();
  const [state, setState] = useState<Record<string, string[]>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.cuisines ?? []]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [onlyBlank, setOnlyBlank] = useState(true);

  const visible = useMemo(
    () => (onlyBlank ? rows.filter((r) => (state[r.id] ?? []).length === 0) : rows),
    [rows, state, onlyBlank]
  );

  const paged = usePagedRows(visible, (r, needle) =>
    r.name.toLowerCase().includes(needle) || r.area.toLowerCase().includes(needle)
  );

  const done = rows.filter((r) => (state[r.id] ?? []).length > 0).length;

  async function save(id: string, kitchens: string[]) {
    setState((cur) => ({ ...cur, [id]: kitchens }));
    setSaving(id);
    const { error } = await supabase.from("venues").update({ cuisines: kitchens }).eq("id", id);
    setSaving(null);
    if (error) {
      setToast(`Could not save: ${error.message}`);
      setTimeout(() => setToast(null), 3000);
    }
  }

  function toggle(row: Row, kitchen: string) {
    const cur = state[row.id] ?? [];
    void save(row.id, cur.includes(kitchen) ? cur.filter((k) => k !== kitchen) : [...cur, kitchen]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">Kitchens</h1>
          <div className="text-[14px] text-mutedbrown">
            What kind of food each place actually serves. This is how somebody asking for Korean
            finds it. Leaving one blank means nobody has recorded a kitchen, which is not the same
            as the food being from nowhere.
          </div>
        </div>
        <div className="text-[14px] text-mutedbrown">
          <b className="text-ink">{done}</b> of {rows.length} recorded
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchBox value={paged.query} onChange={paged.setQuery} placeholder="Search name or area" />
        <label className="flex cursor-pointer items-center gap-2 text-[14px] font-semibold">
          <input
            type="checkbox"
            checked={onlyBlank}
            onChange={(e) => setOnlyBlank(e.target.checked)}
          />
          Only the ones still blank
        </label>
      </div>

      {paged.pageRows.length === 0 ? (
        <p className="mt-6 rounded-bar border border-line bg-cream/60 p-4 text-[14px] text-mutedbrown">
          {onlyBlank
            ? "Every venue has a kitchen recorded. Untick above to change one."
            : "Nothing matches that search."}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {paged.pageRows.map((row) => {
            const mine = state[row.id] ?? [];
            return (
              <div key={row.id} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <Link
                      href={`/admin/venues/${row.id}`}
                      className="text-[15px] font-bold text-ink hover:text-flame"
                    >
                      {row.name}
                    </Link>
                    <span className="ml-2 text-[13px] capitalize text-mutedbrown">
                      {row.type} · {row.area}
                      {/* The coarse field, for context. It answers a different question. */}
                      {row.cuisine ? ` · ${row.cuisine}` : ""}
                    </span>
                  </div>
                  {saving === row.id && <span className="text-[12px] text-mutedbrown">saving…</span>}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {COMMON.map((k) => {
                    const on = mine.includes(k);
                    return (
                      <button
                        key={k}
                        onClick={() => toggle(row, k)}
                        className={`rounded-full border px-2.5 py-1 text-[12.5px] font-semibold capitalize transition-colors ${
                          on
                            ? "border-flame bg-flame text-blush"
                            : "border-line text-cocoa hover:border-flame hover:text-flame"
                        }`}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>

                {/* Anything the buttons do not cover, and a way to see what is set. */}
                <input
                  className="inp mt-2.5"
                  placeholder="Or type them, comma separated"
                  defaultValue={mine.join(", ")}
                  key={mine.join(",")}
                  onBlur={(e) => {
                    const next = e.target.value
                      .split(",")
                      .map((x) => x.trim().toLowerCase())
                      .filter(Boolean);
                    if (next.join(",") !== mine.join(",")) void save(row.id, next);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        count={paged.pageRows.length}
        total={paged.total}
        unit="venues"
        onGoTo={paged.goTo}
      />

      <p className="mt-5 text-[13px] text-mutedbrown">
        Known kitchens: {CUISINE_KINDS.join(", ")}. Anything else is allowed; these are only what
        the search offers as suggestions.
      </p>

      {toast && <Toast message={toast} />}
    </div>
  );
}
