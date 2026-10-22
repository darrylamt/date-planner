import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { refreshPull } from "@/lib/pull";

/** The nightly pull, now: the admin's "Recompute" button (/admin/pull). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  try {
    return NextResponse.json({ ok: true, ...(await refreshPull(gate.supabase)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
