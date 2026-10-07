"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/planner/Sheet";
import { PosterUpload } from "@/components/planner/PosterUpload";
import { IconEdit, IconPlus, IconTrash } from "@/components/planner/icons";

export interface Size {
  id?: string;
  label: string;
  price: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  sizes: { id: string; label: string; price_ghs: number; is_active: boolean }[];
}

const EXAMPLES = {
  cake: { name: "Red velvet cake", sizes: ["6 inch", "8 inch"] },
  flowers: { name: "Red roses", sizes: ["6 stems", "12 stems"] },
};

/**
 * What a vendor sells, as people see it in their plan: a photo, a name and
 * the sizes with their prices. Everything goes live when saved; a product
 * taken out of plans is hidden, never deleted, because pickups already in
 * people's plans point at its sizes.
 */
export function ProductsManager({ vendorId, kind, products: initial }: { vendorId: string; kind: "cake" | "flowers"; products: Product[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [products, setProducts] = useState(initial);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  async function toggle(p: Product) {
    const { error } = await supabase.from("gift_products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return say("That did not save. Try again.");
    setProducts((cur) => cur.map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x)));
    say(p.is_active ? "Hidden from plans." : "Back in plans.");
  }

  const live = products.filter((p) => p.is_active);
  const hidden = products.filter((p) => !p.is_active);

  return (
    <div>
      {!products.length ? (
        <div className="pl-card pl-up flex flex-col items-center px-6 py-10 text-center">
          <div className="pl-float text-[56px]">{kind === "cake" ? "🎂" : "💐"}</div>
          <h3 className="mt-3 text-[20px] font-bold">Add your first {kind === "cake" ? "cake" : "bouquet"}</h3>
          <p className="mt-1.5 max-w-[360px] text-[15px] text-[var(--p-muted)]">
            A photo, a name and the sizes you sell, with prices. It shows in plans for birthdays, anniversaries and dates straight away.
          </p>
          <button type="button" className="pl-btn pl-pulse mt-6" onClick={() => setEditing("new")}>
            <IconPlus size={20} /> Add a product
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" className="pl-btn !min-h-[46px]" onClick={() => setEditing("new")}>
              <IconPlus size={18} /> Add a product
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...live, ...hidden].map((p, i) => (
              <article key={p.id} className={`pl-card pl-up overflow-hidden ${p.is_active ? "" : "opacity-60"}`} style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex gap-3 p-3.5">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-[var(--p-sunken)] text-[30px]">{kind === "cake" ? "🎂" : "💐"}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16.5px] font-bold">{p.name}</h3>
                    {!p.is_active ? <div className="text-[12.5px] font-bold text-[var(--p-warn)]">Hidden from plans</div> : null}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.sizes
                        .filter((s) => s.is_active)
                        .map((s) => (
                          <span key={s.id} className="rounded-full bg-[var(--p-sunken)] px-2.5 py-1 text-[12.5px] font-semibold">
                            {s.label} · GHS {Math.round(s.price_ghs)}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 border-t border-[var(--p-line)] text-[13.5px] font-bold">
                  <button type="button" className="pl-tap flex items-center justify-center gap-1.5 py-3 hover:bg-[var(--p-sunken)]" onClick={() => setEditing(p)}>
                    <IconEdit size={17} /> Edit
                  </button>
                  <button
                    type="button"
                    className="pl-tap flex items-center justify-center gap-1.5 border-l border-[var(--p-line)] py-3 hover:bg-[var(--p-sunken)]"
                    onClick={() => void toggle(p)}
                  >
                    {p.is_active ? "Hide from plans" : "Show in plans"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a product" : "Edit product"}>
        {editing ? (
          <ProductForm
            key={editing === "new" ? "new" : editing.id}
            kind={kind}
            vendorId={vendorId}
            product={editing === "new" ? null : editing}
            sortOrder={products.length}
            onSaved={(msg) => {
              setEditing(null);
              say(msg);
              router.refresh();
            }}
          />
        ) : null}
      </Sheet>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-6 md:bottom-8">
          <div className="pl-up rounded-full bg-[var(--p-ink)] px-5 py-3 text-[14.5px] font-semibold text-white shadow-xl">{toast}</div>
        </div>
      ) : null}
    </div>
  );
}

function ProductForm({
  kind,
  vendorId,
  product,
  sortOrder,
  onSaved,
}: {
  kind: "cake" | "flowers";
  vendorId: string;
  product: Product | null;
  sortOrder: number;
  onSaved: (message: string) => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [image, setImage] = useState(product?.image_url ?? "");
  const [sizes, setSizes] = useState<Size[]>(
    product?.sizes.filter((s) => s.is_active).map((s) => ({ id: s.id, label: s.label, price: String(Math.round(s.price_ghs)) })) ?? [{ label: "", price: "" }]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const example = EXAMPLES[kind];

  async function save() {
    const clean = sizes.map((s) => ({ ...s, label: s.label.trim(), price: s.price.trim() })).filter((s) => s.label || s.price);
    if (name.trim().length < 2) return setError("Give it a name.");
    if (!clean.length) return setError("Add at least one size with its price.");
    if (clean.some((s) => !s.label || !(Number(s.price) > 0))) return setError("Every size needs a name and a price above 0.");
    setBusy(true);
    setError(null);

    let productId = product?.id ?? null;
    const fields = { name: name.trim(), description: description.trim() || null, image_url: image.trim() || null };
    if (productId) {
      const { error: e } = await supabase.from("gift_products").update(fields).eq("id", productId);
      if (e) return fail();
    } else {
      const { data, error: e } = await supabase
        .from("gift_products")
        .insert({ ...fields, vendor_id: vendorId, sort_order: sortOrder, is_active: true })
        .select("id")
        .single();
      if (e || !data) return fail();
      productId = data.id as string;
    }

    // Sizes: change the ones kept, add the new, and hide the removed (pickups may point at them).
    const kept = new Set(clean.filter((s) => s.id).map((s) => s.id));
    for (const [i, s] of clean.entries()) {
      const row = { label: s.label, price_ghs: Number(s.price), sort_order: i, is_active: true, magnitude: Number(s.label.match(/\d+/)?.[0]) || null };
      const { error: e } = s.id
        ? await supabase.from("gift_variants").update(row).eq("id", s.id)
        : await supabase.from("gift_variants").insert({ ...row, product_id: productId });
      if (e) return fail();
    }
    for (const old of product?.sizes ?? []) {
      if (old.is_active && !kept.has(old.id)) await supabase.from("gift_variants").update({ is_active: false }).eq("id", old.id);
    }
    setBusy(false);
    onSaved(product ? "Saved. It is live in plans." : "Added. It is live in plans.");
  }

  function fail() {
    setBusy(false);
    setError("That did not save. Check your connection and try again.");
  }

  return (
    <div className="flex flex-col gap-5">
      <PosterUpload value={image} onChange={setImage} folder="gifts" label="Add a photo" hint="A clear photo of this one. It is what people choose by." aspect="aspect-[4/3]" />
      <label className="block">
        <span className="pl-label">Name</span>
        <input className="pl-input" value={name} maxLength={60} placeholder={example.name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className="pl-label">In a sentence (optional)</span>
        <textarea
          className="pl-input"
          value={description}
          maxLength={240}
          placeholder={kind === "cake" ? "Soft red velvet with cream cheese frosting." : "Fresh red roses, wrapped and tied."}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div>
        <span className="pl-label">Sizes and prices</span>
        <div className="flex flex-col gap-2">
          {sizes.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="pl-input flex-1"
                value={s.label}
                maxLength={30}
                placeholder={example.sizes[i % 2]}
                onChange={(e) => setSizes((cur) => cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <div className="relative w-[130px] shrink-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[var(--p-muted)]">GHS</span>
                <input
                  className="pl-input !pl-12"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={s.price}
                  placeholder="250"
                  onChange={(e) => setSizes((cur) => cur.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
                />
              </div>
              {sizes.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remove this size"
                  className="pl-tap grid w-11 shrink-0 place-items-center rounded-xl text-[var(--p-muted)] hover:text-[#b42318]"
                  onClick={() => setSizes((cur) => cur.filter((_, j) => j !== i))}
                >
                  <IconTrash size={18} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {sizes.length < 6 ? (
          <button type="button" className="mt-2 text-[14px] font-bold text-[var(--p-accent)]" onClick={() => setSizes((cur) => [...cur, { label: "", price: "" }])}>
            + Add another size
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[14px] font-semibold text-[var(--p-accent-dark)]">{error}</p> : null}
      <button type="button" className="pl-btn" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : product ? "Save changes" : "Add it"}
      </button>
    </div>
  );
}
