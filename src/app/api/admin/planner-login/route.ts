import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/adminAuth";
import { emailForUsername, normaliseUsername } from "@/lib/venueUsername";

/**
 * Issue, or withdraw, an event planner's login.
 *
 * The venue version of this route hands a login to a place that already
 * exists. This one hands out the right to invent places, which is why there
 * is no self-service version of it anywhere and never should be: the only
 * verification aduro performs on a planner happens in a conversation before
 * this endpoint is called. Nothing downstream reviews what they write.
 *
 * Same synthetic domain as a venue's, deliberately. The two share one
 * username namespace, so a planner and a venue can never be issued the same
 * name and a login never has to say which kind of account it is. The address
 * takes no mail, so a portal account cannot start a password reset it could
 * finish; an admin reissues instead.
 *
 * The password is returned exactly once, here, and is never stored anywhere
 * we can read it back.
 */

const createSchema = z.object({
  action: z.literal("create"),
  username: z.string().min(3).max(30),
  displayName: z.string().min(2).max(80),
  contactPhone: z.string().max(40).optional(),
});

const resetSchema = z.object({
  action: z.literal("reset"),
  userId: z.string().uuid(),
});

/**
 * Off, not gone.
 *
 * Deleting the auth user would cascade event_planners and take the account
 * with it, but every location they made stays behind owned by a user id that
 * no longer resolves. Clearing is_active stops them creating anything new and
 * leaves what they have already published exactly where it is, which is what
 * an admin actually wants when a planner turns out to be careless.
 */
const suspendSchema = z.object({
  action: z.literal("suspend"),
  userId: z.string().uuid(),
  active: z.boolean(),
});

const bodySchema = z.union([createSchema, resetSchema, suspendSchema]);

/** Readable aloud, and still hard to guess. See the venue-login route. */
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

  if (body.action === "suspend") {
    const { error } = await supabase
      .from("event_planners")
      .update({ is_active: body.active })
      .eq("user_id", body.userId)
      .select("user_id");
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

  /*
   * Checked against both tables before the account is made.
   *
   * createUser would catch a real clash on its own, because both kinds of
   * account resolve to one email address, but it would do it after creating
   * nothing and saying "user already registered", which tells an admin
   * looking at a list of planners very little. Checking first also keeps a
   * failed attempt from leaving an orphan auth user holding the name.
   */
  const [{ data: takenByVenue }, { data: takenByPlanner }] = await Promise.all([
    supabase.from("venue_users").select("id").eq("username", username).maybeSingle(),
    supabase.from("event_planners").select("user_id").eq("username", username).maybeSingle(),
  ]);
  if (takenByVenue || takenByPlanner) {
    return NextResponse.json({ error: "That username is taken." }, { status: 409 });
  }

  const password = generatePassword();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: emailForUsername(username),
    password,
    // The address is a dead end by design, so there is no confirmation mail
    // anybody could ever click.
    email_confirm: true,
    user_metadata: { venue_portal: true, event_planner: true, username },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Could not create that login." },
      { status: 400 }
    );
  }

  const { error: rowError } = await supabase.from("event_planners").insert({
    user_id: created.user.id,
    username,
    display_name: body.displayName.trim(),
    contact_phone: body.contactPhone?.trim() || null,
    created_by: adminId,
  });

  if (rowError) {
    // Without the row the account is a planner of nothing: is_event_planner()
    // is false, so it cannot create a location and the portal sends it to the
    // not-a-venue page. It would still hold the username, though, so the next
    // attempt at the same name would fail for a reason nobody could see.
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: rowError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, username, password, userId: created.user.id });
}
