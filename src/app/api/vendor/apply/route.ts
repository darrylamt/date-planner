import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * A cake or flower shop's application. Public, so it writes nothing that
 * reaches users: only a row an admin reads at /admin/vendors.
 */

const schema = z.object({
  businessName: z.string().trim().min(2).max(80),
  kind: z.enum(["cake", "flowers"]),
  contactName: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(9).max(30),
  whatsappPhone: z.string().trim().max(30).optional(),
  instagramHandle: z.string().trim().max(60).optional(),
  area: z.string().trim().max(60).optional(),
  note: z.string().trim().max(600).optional(),
  website: z.string().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // The hidden field: a person never sees it, so anything in it is a bot.
  // Answered as a success so it does not learn to leave it empty.
  if (body.website) return NextResponse.json({ ok: true });

  const db = createServiceClient();

  // One open application per number is plenty; a second tap is not a second shop.
  const { data: open } = await db.from("vendor_applications").select("id").eq("phone", body.phone).eq("status", "new").limit(1);
  if (open?.length) return NextResponse.json({ ok: true });

  const { error } = await db.from("vendor_applications").insert({
    business_name: body.businessName,
    kind: body.kind,
    contact_name: body.contactName || null,
    phone: body.phone,
    whatsapp_phone: body.whatsappPhone || null,
    instagram_handle: body.instagramHandle?.replace(/^@/, "") || null,
    area: body.area || null,
    note: body.note || null,
  });
  if (error) return NextResponse.json({ error: "Could not send that." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
