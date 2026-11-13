import { NextResponse } from "next/server";
import { createCatalogClient, createServiceClient } from "@/lib/supabase/server";
import { menuPath } from "@/lib/menuPage";
import { SITE_URL } from "@/lib/site";

/*
 * A table sticker's address: /q/<first 8 characters of the venue id>
 * (admin/venues/[id]/qr). Short, so the printed code is simple and scans
 * from across a table in dim light. Sends the phone to the venue's menu
 * page and counts the scan in share_events (kind "qr", page "menu", the venue id in plan_slug; 0109), so a venue can be
 * told how often its sticker is used.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const code = params.code.toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(code)) return NextResponse.redirect(SITE_URL, 302);
  const { data } = await createCatalogClient()
    .from("venues")
    .select("id, name, areas(name)")
    .gte("id", `${code}-0000-0000-0000-000000000000`)
    .lte("id", `${code}-ffff-ffff-ffff-ffffffffffff`)
    .eq("is_active", true)
    .limit(1);
  const v = (data ?? [])[0] as unknown as { id: string; name: string; areas: { name: string } | null } | undefined;
  if (!v) return NextResponse.redirect(SITE_URL, 302);
  // Counting must never stop the redirect.
  await createServiceClient()
    .from("share_events")
    .insert({ kind: "qr", page: "menu", plan_slug: v.id })
    .then(
      () => undefined,
      () => undefined
    );
  return NextResponse.redirect(`${SITE_URL}${menuPath(v.id, v.name, v.areas?.name)}`, 302);
}
