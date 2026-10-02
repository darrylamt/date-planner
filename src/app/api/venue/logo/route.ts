import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * An event planner's logo: upload or remove it (migration 0071).
 *
 * The admin upload route will not do, rightly: it is the admin gate, and a
 * public bucket that any portal login may write to anything is a free file
 * host. This takes one image, from a signed-in planner whose account is on,
 * into logos/, and does exactly three things with it: stores it, sets it as
 * their logo, and stamps it with their name on every event at their
 * locations, so every plan made from now on carries it. A plan already saved
 * keeps the card it was made with.
 *
 * Multipart: `file` to set one, or `remove=1` to take it off.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export async function POST(req: Request) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again, then try once more." }, { status: 401 });

  const db = createServiceClient();
  const { data: planner } = await db
    .from("event_planners")
    .select("user_id, display_name, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!planner) return NextResponse.json({ error: "Logos are for event planner accounts." }, { status: 403 });
  if (!planner.is_active) return NextResponse.json({ error: "This account is switched off. Get in touch with us." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  let url: string | null = null;
  if (form.get("remove") !== "1") {
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No picture was sent." }, { status: 400 });
    const extension = ALLOWED.get(file.type);
    if (!extension) return NextResponse.json({ error: "Use a PNG, JPEG or WebP picture." }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.` }, { status: 400 });
    }
    // Named by chance, never by the file's own name, and never overwriting.
    const path = `logos/${crypto.randomUUID()}.${extension}`;
    const { error: upErr } = await db.storage.from("images").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return NextResponse.json({ error: "Could not store that picture. Try again." }, { status: 500 });
    url = db.storage.from("images").getPublicUrl(path).data.publicUrl;
  }

  const { error: setErr } = await db.from("event_planners").update({ logo_url: url }).eq("user_id", user.id);
  if (setErr) {
    // The column arrives with 0071; before it, there is nowhere to keep a logo.
    return NextResponse.json({ error: "Logos are not switched on yet. Try again later." }, { status: 503 });
  }

  // Every event of theirs, so the next plan built around one carries it: the
  // ones they made anywhere (0072), and any at their own locations.
  const stamp = url ? { organiser_name: planner.display_name, organiser_logo_url: url } : { organiser_logo_url: null };
  const { data: places } = await db.from("venue_users").select("venue_id").eq("user_id", user.id);
  const venueIds = (places ?? []).map((p) => p.venue_id as string);
  // Before 0072 there is no created_by, and this one fails harmlessly.
  await db.from("events").update(stamp).eq("created_by", user.id);
  if (venueIds.length) await db.from("events").update(stamp).in("venue_id", venueIds);

  return NextResponse.json({ ok: true, url });
}
