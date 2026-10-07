import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { emailForUsername, normaliseUsername } from "@/lib/venueUsername";

/**
 * Cake and flower vendors: approve or decline an application, and issue,
 * reset or withdraw a vendor's login.
 *
 * Approving is what makes a vendor. It creates the gift_vendors row from the
 * application, switched on, and a login that runs it; the vendor then adds
 * their own products. A vendor with no products shows nowhere, so being
 * switched on before they have added any costs nothing.
 *
 * Usernames share one namespace with venues and planners (one synthetic
 * domain), and the password is returned once and never stored.
 */

const approveSchema = z.object({
  action: z.literal("approve"),
  applicationId: z.string().uuid(),
  username: z.string().min(3).max(30),
});

const declineSchema = z.object({
  action: z.literal("decline"),
  applicationId: z.string().uuid(),
});

/** A login for a vendor an admin added by hand, before the portal existed. */
const issueSchema = z.object({
  action: z.literal("issue"),
  vendorId: z.string().uuid(),
  username: z.string().min(3).max(30),
});

const resetSchema = z.object({ action: z.literal("reset"), userId: z.string().uuid() });

/** The login goes; the vendor and its products stay, for admins to run. */
const revokeSchema = z.object({ action: z.literal("revoke"), userId: z.string().uuid() });

const bodySchema = z.union([approveSchema, declineSchema, issueSchema, resetSchema, revokeSchema]);

function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

type Admin = Extract<Awaited<ReturnType<typeof requireAdmin>>, { ok: true }>;

/** Make the login for a vendor row. Returns the password, or an error response. */
async function issueLogin(gate: Admin, vendorId: string, rawUsername: string) {
  const { supabase, userId: adminId } = gate;
  const username = normaliseUsername(rawUsername);
  if (!username) {
    return {
      error: NextResponse.json(
        { error: "Usernames are lowercase letters, numbers, dots, dashes and underscores, 3 to 30 characters." },
        { status: 400 }
      ),
    };
  }

  const { data: hasLogin } = await supabase.from("vendor_users").select("user_id").eq("vendor_id", vendorId).limit(1);
  if (hasLogin?.length) return { error: NextResponse.json({ error: "That vendor already has a login. Reset its password instead." }, { status: 409 }) };

  const [{ data: v }, { data: p }, { data: g }] = await Promise.all([
    supabase.from("venue_users").select("id").eq("username", username).maybeSingle(),
    supabase.from("event_planners").select("user_id").eq("username", username).maybeSingle(),
    supabase.from("vendor_users").select("user_id").eq("username", username).maybeSingle(),
  ]);
  if (v || p || g) return { error: NextResponse.json({ error: "That username is taken." }, { status: 409 }) };

  const password = generatePassword();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: emailForUsername(username),
    password,
    email_confirm: true,
    user_metadata: { venue_portal: true, gift_vendor: true, username },
  });
  if (createError || !created.user) {
    return { error: NextResponse.json({ error: createError?.message ?? "Could not create that login." }, { status: 400 }) };
  }

  const { error: rowError } = await supabase.from("vendor_users").insert({
    user_id: created.user.id,
    vendor_id: vendorId,
    username,
    created_by: adminId,
  });
  if (rowError) {
    // Without the row the login runs nothing but still holds the name.
    await supabase.auth.admin.deleteUser(created.user.id);
    return { error: NextResponse.json({ error: rowError.message }, { status: 400 }) };
  }
  return { username, password, userId: created.user.id };
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.action === "decline") {
    const { error } = await supabase
      .from("vendor_applications")
      .update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("id", body.applicationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset") {
    const { data: link } = await supabase.from("vendor_users").select("user_id").eq("user_id", body.userId).maybeSingle();
    if (!link) return NextResponse.json({ error: "That is not a vendor's login." }, { status: 404 });
    const password = generatePassword();
    const { error } = await supabase.auth.admin.updateUserById(body.userId, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, password });
  }

  if (body.action === "revoke") {
    // Only ever a vendor's login: this must not be able to delete an app user.
    const { data: link } = await supabase.from("vendor_users").select("user_id").eq("user_id", body.userId).maybeSingle();
    if (!link) return NextResponse.json({ error: "That is not a vendor's login." }, { status: 404 });
    const { error } = await supabase.auth.admin.deleteUser(body.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "issue") {
    const out = await issueLogin(gate, body.vendorId, body.username);
    if ("error" in out) return out.error;
    return NextResponse.json({ ok: true, ...out });
  }

  // ── approve ──
  const { data: app } = await supabase.from("vendor_applications").select("*").eq("id", body.applicationId).maybeSingle();
  if (!app) return NextResponse.json({ error: "No such application." }, { status: 404 });
  if (app.status === "approved") return NextResponse.json({ error: "Already approved." }, { status: 409 });

  // Their area, when what they typed names one of ours. Otherwise they pick it under Details.
  const { data: areas } = await supabase.from("areas").select("id, name");
  const typed = String(app.area ?? "").toLowerCase();
  const area = typed
    ? ((areas ?? []) as { id: string; name: string }[])
        .filter((a) => typed.includes(a.name.toLowerCase()))
        .sort((a, b) => b.name.length - a.name.length)[0]
    : undefined;

  const { data: vendor, error: vendorError } = await supabase
    .from("gift_vendors")
    .insert({
      name: app.business_name,
      kind: app.kind,
      area_id: area?.id ?? null,
      address: app.area,
      phone: app.phone,
      whatsapp_phone: app.whatsapp_phone,
      instagram_handle: app.instagram_handle,
      // Cakes are baked to order; flowers are usually same day. They can change it.
      lead_time_hours: app.kind === "cake" ? 48 : 0,
      is_active: true,
    })
    .select("id")
    .single();
  if (vendorError || !vendor) return NextResponse.json({ error: vendorError?.message ?? "Could not create the vendor." }, { status: 400 });

  const out = await issueLogin(gate, vendor.id, body.username);
  if ("error" in out) {
    await supabase.from("gift_vendors").delete().eq("id", vendor.id);
    return out.error;
  }

  await supabase
    .from("vendor_applications")
    .update({ status: "approved", decided_at: new Date().toISOString(), vendor_id: vendor.id })
    .eq("id", app.id);

  return NextResponse.json({ ok: true, vendorId: vendor.id, ...out });
}
