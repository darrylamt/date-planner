import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { emailForUsername, normaliseUsername } from "@/lib/venueUsername";

/**
 * Issue, or reissue, a venue's login.
 *
 * Venues get a username and a password read to them over the phone or sent in
 * a message, because most have no inbox they check and the ones that do share
 * it with the whole building. Supabase needs an email, so one is synthesised
 * against a domain that takes no mail: a portal account cannot then start a
 * password reset it can finish, and an admin reissuing is the only way back
 * in. That is the right amount of ceremony for a credential that can change
 * what a restaurant charges.
 *
 * The password is returned exactly once, in this response, and is never stored
 * anywhere we can read it back. Losing it means issuing another.
 */

const createSchema = z.object({
  action: z.literal("create"),
  venueId: z.string().uuid(),
  username: z.string().min(3).max(30),
});

const resetSchema = z.object({
  action: z.literal("reset"),
  userId: z.string().uuid(),
});

const revokeSchema = z.object({
  action: z.literal("revoke"),
  linkId: z.string().uuid(),
});

const bodySchema = z.union([createSchema, resetSchema, revokeSchema]);

/**
 * Readable aloud, and still hard to guess.
 *
 * No l, I, 1, O or 0, because this gets dictated over a phone line and a
 * password somebody cannot repeat back is a password they write down wrong.
 * Four groups of four from a 30-character alphabet is about 78 bits, which is
 * far past anything that matters here.
 */
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

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.action === "revoke") {
    /*
     * The link goes, the account stays. Deleting the auth user would also take
     * anything else they own, and an account that runs nothing can reach
     * nothing: every policy in 0038 goes through venue_users.
     */
    const { error } = await supabase.from("venue_users").delete().eq("id", body.linkId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset") {
    const password = generatePassword();
    const { error } = await supabase.auth.admin.updateUserById(body.userId, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, password });
  }

  const username = normaliseUsername(body.username);
  if (!username) {
    return NextResponse.json(
      {
        error:
          "Usernames are lowercase letters, numbers, dots, dashes and underscores, 3 to 30 characters.",
      },
      { status: 400 }
    );
  }

  // Checked before the account is made, so a clash does not leave an orphan
  // auth user behind with no link to anything.
  const { data: taken } = await supabase
    .from("venue_users")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (taken) {
    return NextResponse.json({ error: "That username is taken." }, { status: 409 });
  }

  const password = generatePassword();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: emailForUsername(username),
    password,
    // Confirmed on creation because the address is a dead end by design, so
    // there is no confirmation mail anybody could ever click.
    email_confirm: true,
    user_metadata: { venue_portal: true, username },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Could not create that login." },
      { status: 400 }
    );
  }

  const { error: linkError } = await supabase.from("venue_users").insert({
    user_id: created.user.id,
    venue_id: body.venueId,
    username,
    created_by: adminId,
  });

  if (linkError) {
    // Without the link the account can reach nothing, but it would still hold
    // the username, so the next attempt at the same name would fail for a
    // reason nobody could see. Take it back out.
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, username, password, userId: created.user.id });
}
