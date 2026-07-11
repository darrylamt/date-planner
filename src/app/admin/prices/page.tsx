import { createClient } from "@/lib/supabase/server";
import { BulkPriceEditor } from "@/components/admin/BulkPriceEditor";
import type { MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Bulk quick-edit for menu prices — prices change often; updating must be fast. */
export default async function BulkPricesPage({
  searchParams,
}: {
  searchParams: { venue?: string };
}) {
  const supabase = createClient();

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .order("name");

  const venueId = searchParams.venue ?? venues?.[0]?.id;
  let items: MenuItem[] = [];
  if (venueId) {
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .eq("venue_id", venueId)
      .order("category");
    items = (data ?? []) as MenuItem[];
  }

  const venueName = venues?.find((v: any) => v.id === venueId)?.name ?? "";
  const latest = items.reduce<string | null>(
    (acc, i) => (!acc || (i.updated_at && i.updated_at > acc) ? i.updated_at ?? acc : acc),
    null
  );
  const staleDays = latest ? Math.floor((Date.now() - new Date(latest).getTime()) / 86400000) : null;

  return (
    <BulkPriceEditor
      venues={(venues ?? []) as { id: string; name: string }[]}
      venueId={venueId ?? null}
      venueName={venueName}
      items={items}
      staleDays={staleDays}
    />
  );
}
