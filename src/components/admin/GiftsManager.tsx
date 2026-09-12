"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/Toast";
import { leadTimeLabel } from "@/lib/pickups";
import { ADMIN_PAGE_SIZE, Pager, SearchBox, usePagedRows } from "./TableControls";
import type { Area } from "@/lib/types";

/**
 * Managing florists, bakers and what they sell.
 *
 * Three levels, because that is what the thing genuinely is: a vendor sells
 * products, and a product comes in sizes that each have their own price. A
 * dozen roses and six roses are the same bouquet at two prices, exactly as an
 * eight-inch and a ten-inch are the same cake.
 */
interface Variant {
  id: string;
  label: string;
  price_ghs: number;
  magnitude: number | null;
  is_active: boolean;
  sort_order: number;
}
interface Product {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  gift_variants: Variant[];
}
interface Vendor {
  id: string;
  name: string;
  kind: "flowers" | "cake";
  address: string | null;
  phone: string | null;
  lead_time_hours: number;
  is_active: boolean;
  area_id: string | null;
  areas: { name: string } | null;
  gift_products: Product[];
}

export function GiftsManager({ areas, vendors }: { areas: Area[]; vendors: Vendor[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openVendor, setOpenVendor] = useState<string | null>(null);

  const paged = usePagedRows(
    vendors,
    (v, needle) =>
      v.name.toLowerCase().includes(needle) ||
      v.kind.includes(needle) ||
      (v.areas?.name ?? "").toLowerCase().includes(needle) ||
      v.gift_products.some((p) => p.name.toLowerCase().includes(needle))
  );

  const [draft, setDraft] = useState({
    name: "",
    kind: "flowers" as "flowers" | "cake",
    area_id: areas[0]?.id ?? "",
    address: "",
    phone: "",
    // Flowers are same-day almost everywhere; a decorated cake rarely is.
    lead_time_hours: 0,
  });

  async function run(label: string, fn: () => Promise<{ error: unknown }>) {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw new Error((error as { message?: string }).message ?? "Failed");
      setToast(label);
      router.refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="card px-5 py-4">
        <div className="text-[15px] font-bold">Add a vendor</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col">
            <span className="flbl">Name</span>
            <input
              className="inp"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Kwame's Flowers"
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Sells</span>
            <select
              className="inp"
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value as "flowers" | "cake";
                // A sensible default rather than a number to think about:
                // cakes need notice, flowers do not.
                setDraft({ ...draft, kind, lead_time_hours: kind === "cake" ? 48 : 0 });
              }}
            >
              <option value="flowers">Flowers</option>
              <option value="cake">Cakes</option>
            </select>
          </label>
          <label className="flex flex-col">
            <span className="flbl">Area</span>
            <select
              className="inp"
              value={draft.area_id}
              onChange={(e) => setDraft({ ...draft, area_id: e.target.value })}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="flbl">Notice needed (hours)</span>
            <input
              className="inp font-mono"
              type="number"
              min={0}
              value={draft.lead_time_hours}
              onChange={(e) =>
                setDraft({ ...draft, lead_time_hours: Number(e.target.value) || 0 })
              }
            />
            <span className="mt-1 text-[12px] text-mutedbrown">
              {leadTimeLabel(draft.lead_time_hours)}. Nothing is offered for a plan
              sooner than this.
            </span>
          </label>
          <label className="flex flex-col">
            <span className="flbl">Address</span>
            <input
              className="inp"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </label>
          <label className="flex flex-col">
            <span className="flbl">Phone</span>
            <input
              className="inp"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </label>
        </div>
        <button
          className="btn btnsm mt-4"
          disabled={busy || !draft.name.trim()}
          onClick={() =>
            run("Vendor added", async () => {
              const res = await supabase.from("gift_vendors").insert({
                name: draft.name.trim(),
                kind: draft.kind,
                area_id: draft.area_id || null,
                address: draft.address || null,
                phone: draft.phone || null,
                lead_time_hours: draft.lead_time_hours,
              });
              if (!res.error) setDraft({ ...draft, name: "", address: "", phone: "" });
              return res;
            })
          }
        >
          Add vendor
        </button>
      </div>

      {vendors.length > ADMIN_PAGE_SIZE ? (
        <div className="mt-6">
          <SearchBox
            value={paged.query}
            onChange={paged.setQuery}
            placeholder="Search vendor, area or product"
          />
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {paged.pageRows.map((v) => {
          const open = openVendor === v.id;
          return (
            <div key={v.id} className="card px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-[16px] font-bold">{v.name}</span>
                  <span className="ml-2 text-[13px] text-mutedbrown">
                    {v.kind === "cake" ? "Cakes" : "Flowers"}
                    {v.areas?.name ? ` · ${v.areas.name}` : ""} ·{" "}
                    {leadTimeLabel(v.lead_time_hours)}
                  </span>
                  {!v.is_active ? <span className="badge b-stale ml-2">inactive</span> : null}
                </div>
                <button
                  className="btn2 btnsm"
                  onClick={() => setOpenVendor(open ? null : v.id)}
                >
                  {open ? "Hide" : `${v.gift_products?.length ?? 0} product(s)`}
                </button>
              </div>

              {open ? (
                <VendorProducts
                  vendor={v}
                  busy={busy}
                  onRun={run}
                  supabase={supabase}
                />
              ) : null}
            </div>
          );
        })}

        {!vendors.length ? (
          <p className="text-[14px] text-mutedbrown">
            No vendors yet. Add a florist and a baker, then give each a couple of
            products with photographs.
          </p>
        ) : null}

        {vendors.length > 0 && !paged.total ? (
          <p className="text-[14px] text-mutedbrown">
            No vendor matches “{paged.query}”.
          </p>
        ) : null}
      </div>

      <Pager
        page={paged.page}
        pageCount={paged.pageCount}
        start={paged.start}
        count={paged.pageRows.length}
        total={paged.total}
        unit="vendors"
        onGoTo={paged.goTo}
      />

      {toast && <Toast message={toast} />}
    </div>
  );
}

function VendorProducts({
  vendor,
  busy,
  onRun,
  supabase,
}: {
  vendor: Vendor;
  busy: boolean;
  onRun: (label: string, fn: () => Promise<{ error: unknown }>) => Promise<void>;
  supabase: ReturnType<typeof createClient>;
}) {
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [variantFor, setVariantFor] = useState<string | null>(null);
  const [vLabel, setVLabel] = useState("");
  const [vPrice, setVPrice] = useState("");

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col">
          <span className="flbl">Product</span>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={vendor.kind === "cake" ? "Chocolate fudge" : "Red roses"}
          />
        </label>
        <label className="flex flex-col flex-1">
          <span className="flbl">Image URL</span>
          <input
            className="inp"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <button
          className="btn btnsm"
          disabled={busy || !name.trim()}
          onClick={() =>
            onRun("Product added", async () => {
              const res = await supabase.from("gift_products").insert({
                vendor_id: vendor.id,
                name: name.trim(),
                image_url: imageUrl.trim() || null,
              });
              if (!res.error) {
                setName("");
                setImageUrl("");
              }
              return res;
            })
          }
        >
          Add
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {(vendor.gift_products ?? []).map((p) => (
          <li key={p.id} className="rounded-bar border border-line bg-shell p-3 text-ink">
            <div className="flex items-center gap-3">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sand text-[11px] text-mutedbrown">
                  no photo
                </div>
              )}
              <div className="flex-1">
                <div className="text-[14px] font-semibold">{p.name}</div>
                <div className="text-[12px] text-mutedbrown">
                  {p.gift_variants?.length
                    ? p.gift_variants
                        .map((x) => `${x.label} GHS ${Number(x.price_ghs)}`)
                        .join(" · ")
                    : "No sizes yet, so it cannot be offered"}
                </div>
              </div>
              <button
                className="btn2 btnsm"
                onClick={() => setVariantFor(variantFor === p.id ? null : p.id)}
              >
                Add size
              </button>
            </div>

            {variantFor === p.id ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col">
                  <span className="flbl">Label</span>
                  <input
                    className="inp"
                    value={vLabel}
                    onChange={(e) => setVLabel(e.target.value)}
                    placeholder={vendor.kind === "cake" ? "8 inch" : "12 stems"}
                  />
                </label>
                <label className="flex flex-col">
                  <span className="flbl">Price (GHS)</span>
                  <input
                    className="inp font-mono max-w-[120px]"
                    type="number"
                    value={vPrice}
                    onChange={(e) => setVPrice(e.target.value)}
                  />
                </label>
                <button
                  className="btn btnsm"
                  disabled={busy || !vLabel.trim() || !vPrice}
                  onClick={() =>
                    onRun("Size added", async () => {
                      const res = await supabase.from("gift_variants").insert({
                        product_id: p.id,
                        label: vLabel.trim(),
                        price_ghs: Number(vPrice) || 0,
                      });
                      if (!res.error) {
                        setVLabel("");
                        setVPrice("");
                      }
                      return res;
                    })
                  }
                >
                  Save
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
