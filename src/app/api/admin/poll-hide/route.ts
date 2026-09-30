import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { nameKey } from "@/lib/namePoll";

/** Take a suggested name out of the public poll, or put it back. Admins only. */
const body = z.object({ name: z.string().min(1).max(60), hidden: z.boolean() });

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  let input: z.infer<typeof body>;
  try {
    input = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const key = nameKey(input.name);
  if (!key) return NextResponse.json({ error: "Bad name." }, { status: 400 });
  const { error } = input.hidden
    ? await gate.supabase.from("name_poll_hidden").upsert({ name_key: key })
    : await gate.supabase.from("name_poll_hidden").delete().eq("name_key", key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
