import { createServiceClient } from "@/lib/supabase/server";
import { requireVendor } from "@/lib/vendorAuth";
import { VendorShell } from "@/components/vendor/VendorShell";

/**
 * Pickups people added to their plans from this vendor.
 *
 * Read with the service role, filtered to this vendor's own sizes, because a
 * pickup lives on a plan and plans are private to the person who made them.
 * So it says what and when, and the cake message and colour, but never who:
 * the customer contacts the vendor themselves, from the plan.
 */
export default async function VendorOrders() {
  const session = await requireVendor();
  const { vendor } = session;
  const db = createServiceClient();

  const { data: products } = await db.from("gift_products").select("id, name, gift_variants(id, label)").eq("vendor_id", vendor.id);
  const variants = new Map<string, { product: string; size: string }>();
  for (const p of (products ?? []) as { id: string; name: string; gift_variants: { id: string; label: string }[] }[]) {
    for (const v of p.gift_variants ?? []) variants.set(v.id, { product: p.name, size: v.label });
  }

  const { data: pickups } = variants.size
    ? await db
        .from("plan_pickups")
        .select("id, variant_id, quantity, message, colour, reference_image_url, price_ghs, created_at, plans(inputs)")
        .in("variant_id", [...variants.keys()])
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };

  const rows = ((pickups ?? []) as unknown as {
    id: string;
    variant_id: string;
    quantity: number;
    message: string | null;
    colour: string | null;
    reference_image_url: string | null;
    price_ghs: number;
    created_at: string;
    plans: { inputs: { date?: string; startTime?: string } } | null;
  }[]).map((r) => ({ ...r, when: r.plans?.inputs?.date ?? r.created_at.slice(0, 10), time: r.plans?.inputs?.startTime ?? null }));

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.when >= today).sort((a, b) => a.when.localeCompare(b.when));
  const past = rows.filter((r) => r.when < today);
  const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <VendorShell name={vendor.name} logoUrl={vendor.image_url}>
      <div className="pl-up mb-6">
        <h1 className="text-[30px] font-bold leading-tight md:text-[36px]">Pickups</h1>
        <p className="mt-1 text-[15px] text-[var(--p-muted)]">
          What people added to their plans from you. They contact you to order; this is so you know what is coming.
        </p>
      </div>

      {!rows.length ? (
        <div className="pl-card p-6 text-center text-[15px] text-[var(--p-muted)]">
          No pickups yet. They appear here as soon as somebody adds one of your {vendor.kind === "cake" ? "cakes" : "bouquets"} to a plan.
        </div>
      ) : null}

      {[
        { title: "Coming up", list: upcoming },
        { title: "Earlier", list: past },
      ].map((g) =>
        g.list.length ? (
          <section key={g.title} className="mb-6">
            <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--p-muted)]">{g.title}</h2>
            <div className="grid gap-3">
              {g.list.map((r) => {
                const v = variants.get(r.variant_id);
                return (
                  <article key={r.id} className="pl-card flex gap-3.5 p-4">
                    <div className="flex w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl bg-[var(--p-sunken)] py-2 text-center text-[12.5px] font-bold">
                      {day(r.when)}
                      {r.time ? <span className="text-[11px] font-semibold text-[var(--p-muted)]">by {r.time.slice(0, 5)}</span> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-bold">
                        {r.quantity > 1 ? `${r.quantity} × ` : ""}
                        {v?.product ?? "A product"} <span className="font-semibold text-[var(--p-muted)]">· {v?.size}</span>
                      </div>
                      <div className="text-[14px] text-[var(--p-muted)]">GHS {Math.round(Number(r.price_ghs))}</div>
                      {r.message ? <div className="mt-1 text-[14px]">On it: &ldquo;{r.message}&rdquo;</div> : null}
                      {r.colour ? <div className="text-[14px]">Colour: {r.colour}</div> : null}
                      {r.reference_image_url ? (
                        <a href={r.reference_image_url} target="_blank" rel="noreferrer" className="text-[14px] font-bold text-[var(--p-accent)] underline">
                          See the picture they sent
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null
      )}
    </VendorShell>
  );
}
