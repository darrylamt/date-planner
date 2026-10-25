import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { STAFF_EMAIL_DOMAIN, STAFF_ROLES, staffEmail } from "@/lib/staff";
import { normaliseUsername } from "@/lib/venueUsername";

/**
 * Staff logins (0095), managed from /admin/team. Full admins only.
 *
 * A login is a username and a password, like a venue's: the person is handed
 * both, and signs in at /staff/login. Reset and remove act only on accounts
 * made here (the staff address domain), so this route can never set the
 * password of an app user or an admin.
 *
 * Removing takes the roles away and changes the password; the account stays,
 * so the edit log keeps saying who did what.
 */
export const dynamic = "force-dynamic";

const role = z.enum(STAFF_ROLES);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), username: z.string().min(3).max(30), roles: z.array(role).min(1) }),
  z.object({ action: z.literal("roles"), userId: z.string().uuid(), roles: z.array(role).min(1) }),
  z.object({ action: z.literal("reset"), userId: z.string().uuid() }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
]);

function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { supabase, userId: adminId } = gate;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data;

  if (b.action === "create") {
    const username = normaliseUsername(b.username);
    if (!username) {
      return NextResponse.json(
        { error: "Usernames are lowercase letters, numbers, dots, dashes and underscores, 3 to 30 characters." },
        { status: 400 }
      );
    }
    const password = generatePassword();
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: staffEmail(username),
      password,
      email_confirm: true,
      user_metadata: { staff: true, username },
    });
    if (error || !created.user) {
      const taken = /already|exists|registered/i.test(error?.message ?? "");
      return NextResponse.json({ error: taken ? "That username is taken." : error?.message ?? "Could not create it." }, { status: taken ? 409 : 400 });
    }
    const { error: e } = await supabase
      .from("staff_roles")
      .insert(b.roles.map((r) => ({ user_id: created.user!.id, role: r, username, granted_by: adminId })));
    if (e) {
      // No roles, no use: the account is removed rather than left behind.
      await supabase.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, username, password });
  }

  // Everything else acts on an existing login, which must be one made here.
  const { data: found } = await supabase.auth.admin.getUserById(b.userId);
  const email = found.user?.email ?? "";
  if (!email.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) {
    return NextResponse.json({ error: "That is not a staff login." }, { status: 404 });
  }
  const username = email.split("@")[0];

  if (b.action === "roles") {
    const { error: d } = await supabase.from("staff_roles").delete().eq("user_id", b.userId);
    if (d) return NextResponse.json({ error: d.message }, { status: 500 });
    const { error } = await supabase
      .from("staff_roles")
      .insert(b.roles.map((r) => ({ user_id: b.userId, role: r, username, granted_by: adminId })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "reset") {
    const password = generatePassword();
    const { error } = await supabase.auth.admin.updateUserById(b.userId, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, username, password });
  }

  // remove: no roles, and a password nobody has.
  const { error } = await supabase.from("staff_roles").delete().eq("user_id", b.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.auth.admin.updateUserById(b.userId, { password: generatePassword() + generatePassword() });
  return NextResponse.json({ ok: true });
}
