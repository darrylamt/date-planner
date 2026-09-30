"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { ghs } from "@/lib/format";
import { ImageField } from "@/components/admin/ImageField";
import type { MenuCategory, MenuItem } from "@/lib/types";

const CATEGORIES: { value: MenuCategory; label: string }[] = [
  { value: "starter", label: "Starters" },
  { value: "main", label: "Mains" },
  { value: "dessert", label: "Desserts" },
  { value: "drink", label: "Drinks" },
  { value: "activity", label: "Things to do" },
  { value: "other", label: "Extras" },
];

export interface MenuScope {
  /** The venue being edited. */
  venueId: string;
  venueName: string;
  /** Where a shared menu is kept, when this venue borrows one. */
  ownerId: string;
  ownerName: string;
  /** How many venues eat off the shared list, including the owner. */
  branchCount: number;
}

/**
 * A venue's menu, one item at a time.
 *
 * ── the branch question ─────────────────────────────────────────────────
 * The Honeysuckle has five locations and one menu, kept once on the Osu row,
 * which is right for the ninety percent of a list that is the same everywhere
 * and wrong for the dish only one kitchen does.
 *
 * That needed no new column, only a change in how a menu is read: an item
 * written on the owner row is on every branch, and an item written on a branch
 * row is on that branch alone. So this screen does not ask "which menu" — it
 * asks "everywhere, or just here", and that answer decides which venue_id the
 * row is written with. The planner merges the two lists.
 *
 * A venue that shares with nobody never sees the question, because for them
 * both answers mean the same thing.
 */
export function MenuEditor({
  scope,
  shared,
  own,
}: {
  scope: MenuScope;
  /** Items on the owner's list, which every branch serves. */
  shared: MenuItem[];
  /** Items written on this venue's own row, which only it serves. */
  own: MenuItem[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<MenuItem[]>([...shared, ...own]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<MenuCategory>("main");
  const [everywhere, setEverywhere] = useState(true);
  // Which item has its details open: a description and a picture.
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftImage, setDraftImage] = useState("");

  const branched = scope.branchCount > 1;

  const say = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const grouped = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        ...c,
        items: rows
          .filter((r) => r.category === c.value)
          .sort((a, b) => Number(a.price_ghs) - Number(b.price_ghs)),
      })).filter((g) => g.items.length > 0),
    [rows]
  );

  async function add() {
    const trimmed = name.trim();
    const amount = Number(price);
    if (!trimmed || !(amount > 0)) {
      say("A dish needs a name and a price.");
      return;
    }

    /*
     * Which row it lands on IS the branch choice. "Everywhere" writes to the
     * owner, so every branch inherits it; "just here" writes to this venue,
     * where only this venue's plans will find it.
     */
    const venue_id = everywhere ? scope.ownerId : scope.venueId;

    setBusy("add");
    const { data, error } = await supabase
      .from("menu_items")
      .insert({ venue_id, name: trimmed, category, price_ghs: amount })
      .select("*")
      .single();
    setBusy(null);

    if (error || !data) {
      say(`Could not add that: ${error?.message ?? "unknown error"}`);
      return;
    }

    setRows((r) => [...r, data as MenuItem]);
    setName("");
    setPrice("");
    say(everywhere && branched ? "Added at every branch" : "Added");
  }

  async function changePrice(item: MenuItem, next: number) {
    if (!(next > 0)) return;
    setBusy(item.id);
    const { error } = await supabase
      .from("menu_items")
      .update({ price_ghs: next })
      .eq("id", item.id);
    setBusy(null);

    if (error) {
      say(`Could not save that price: ${error.message}`);
      return;
    }
    setRows((r) => r.map((x) => (x.id === item.id ? { ...x, price_ghs: next } : x)));
  }

  function openDetails(item: MenuItem) {
    if (openId === item.id) return setOpenId(null);
    setOpenId(item.id);
    setDraftNotes(item.notes ?? "");
    setDraftImage(item.image_url ?? "");
  }

  /*
   * The description and picture guests see when they tap the item in the
   * app. The picture is only sent when one was set, so saving a description
   * works on a database that has not added the picture column yet.
   */
  async function saveDetails(item: MenuItem) {
    setBusy(item.id);
    const patch: Record<string, unknown> = { notes: draftNotes.trim() || null };
    if (draftImage.trim() || item.image_url) patch.image_url = draftImage.trim() || null;
    const { error } = await supabase.from("menu_items").update(patch).eq("id", item.id);
    setBusy(null);
    if (error) {
      say(`Could not save that: ${error.message}`);
      return;
    }
    setRows((r) =>
      r.map((x) => (x.id === item.id ? { ...x, notes: patch.notes as string | null, image_url: (patch.image_url as string | null | undefined) ?? x.image_url } : x))
    );
    setOpenId(null);
    say("Saved");
  }

  async function remove(item: MenuItem) {
    if (!confirm(`Take "${item.name}" off the menu?`)) return;
    setBusy(item.id);
    const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
    setBusy(null);

    if (error) {
      say(`Could not remove that: ${error.message}`);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== item.id));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Add ── */}
      <div className="card p-5">
        <h2 className="font-display text-[18px] font-bold">Add a dish</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_130px_170px_auto] md:items-end">
          <label className="flex flex-col">
            <span className="flbl">What is it</span>
            <input
              className="inp"
              value={name}
              placeholder="Jollof with chicken"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Price, GHS</span>
            <input
              className="inp font-mono"
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Course</span>
            <select
              className="inp"
              value={category}
              onChange={(e) => setCategory(e.target.value as MenuCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btnsm px-6" onClick={() => void add()} disabled={busy === "add"}>
            {busy === "add" ? "Adding…" : "Add"}
          </button>
        </div>

        {/*
          Only asked when it can mean two different things. A venue that shares
          with nobody would be answering a question about branches it does not
          have.
        */}
        {branched ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <span className="self-center text-[13px] text-mutedbrown">Put it on:</span>
            <button
              type="button"
              onClick={() => setEverywhere(true)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                everywhere
                  ? "border-flame bg-flame text-blush"
                  : "border-line text-cocoa hover:border-flame hover:text-flame"
              }`}
            >
              All {scope.branchCount} branches
            </button>
            <button
              type="button"
              onClick={() => setEverywhere(false)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                !everywhere
                  ? "border-flame bg-flame text-blush"
                  : "border-line text-cocoa hover:border-flame hover:text-flame"
              }`}
            >
              {scope.venueName} only
            </button>
          </div>
        ) : null}
      </div>

      {/* ── The menu ── */}
      {grouped.length === 0 ? (
        <p className="rounded-bar border border-line bg-cream/60 p-5 text-[14px] text-mutedbrown">
          Nothing on your menu yet. Without prices we cannot put you in anybody&apos;s evening,
          because every plan has a budget it has to keep.
        </p>
      ) : (
        grouped.map((group) => (
          <div key={group.value} className="card p-5">
            <h3 className="font-display text-[16px] font-bold">{group.label}</h3>
            <div className="mt-2 divide-y divide-line">
              {group.items.map((item) => {
                const onlyHere = item.venue_id === scope.venueId && scope.ownerId !== scope.venueId;
                return (
                  <div key={item.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="mr-2 inline-block h-8 w-8 rounded object-cover align-middle" />
                      ) : null}
                      <span className="text-[14.5px]">{item.name}</span>
                      {branched ? (
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                            onlyHere ? "bg-sand text-cocoa" : "bg-cream text-mutedbrown"
                          }`}
                        >
                          {onlyHere ? "this branch only" : "all branches"}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] text-mutedbrown">GHS</span>
                      <input
                        type="number"
                        min={1}
                        className="inp h-[34px] w-[92px] font-mono"
                        defaultValue={Number(item.price_ghs)}
                        disabled={busy === item.id}
                        onBlur={(e) => {
                          const next = Number(e.target.value);
                          if (next !== Number(item.price_ghs)) void changePrice(item, next);
                        }}
                      />
                      <button
                        onClick={() => openDetails(item)}
                        className="rounded-md border border-line px-2 py-1 text-[12px] font-semibold text-cocoa transition-colors hover:border-flame hover:text-flame"
                      >
                        {openId === item.id ? "Close" : "Details"}
                      </button>
                      <button
                        onClick={() => void remove(item)}
                        disabled={busy === item.id}
                        aria-label={`Remove ${item.name}`}
                        className="rounded-md border border-line px-2 py-1 text-[12px] text-mutedbrown transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {item.notes && openId !== item.id ? (
                    <div className="mt-1 text-[12.5px] text-mutedbrown">{item.notes}</div>
                  ) : null}
                  {openId === item.id ? (
                    <div className="mt-3 grid gap-3 rounded-bar bg-cream/60 p-4">
                      <label className="flex flex-col">
                        <span className="flbl">What is in it, or what to expect</span>
                        <textarea
                          className="inp min-h-[70px] py-2"
                          maxLength={400}
                          value={draftNotes}
                          placeholder="Grilled tilapia, banku and pepper sauce. Serves one."
                          onChange={(e) => setDraftNotes(e.target.value)}
                        />
                      </label>
                      <ImageField
                        label="Picture"
                        value={draftImage}
                        onChange={setDraftImage}
                        folder="menu"
                        hint="Shown when a guest taps this item in the app"
                      />
                      <div>
                        <button className="btn btnsm px-6" disabled={busy === item.id} onClick={() => void saveDetails(item)}>
                          {busy === item.id ? "Saving…" : "Save details"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[12.5px] text-mutedbrown">
              {group.items.length} item{group.items.length === 1 ? "" : "s"},{" "}
              {ghs(Math.min(...group.items.map((i) => Number(i.price_ghs))))} to{" "}
              {ghs(Math.max(...group.items.map((i) => Number(i.price_ghs))))}
            </div>
          </div>
        ))
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
