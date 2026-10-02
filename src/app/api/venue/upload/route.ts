import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * A picture from the venue portal: a poster, a listing photo, a dish.
 *
 * Every picture field in the portal used to post to /api/admin/upload, which
 * is the admin gate, so for a venue or a planner uploading a file simply
 * failed and only pasting a link worked. A poster usually exists as a picture
 * on a phone, with no link to paste. This is the same upload, for a signed-in
 * portal account only: somebody who runs a venue or is an active planner.
 * Never an app user, because a public bucket anybody with an account may write
 * to is a free file host.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
]);
/** Where a portal upload may land, and nowhere else. */
const FOLDERS = new Set(["venues", "events", "menu", "locations"]);

export async function POST(req: Request) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again, then try once more." }, { status: 401 });

  const db = createServiceClient();
  const [{ data: runs }, { data: planner }] = await Promise.all([
    db.from("venue_users").select("venue_id").eq("user_id", user.id).limit(1),
    db.from("event_planners").select("is_active").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!runs?.length && !planner?.is_active) {
    return NextResponse.json({ error: "Uploads are for venue and planner accounts." }, { status: 403 });
  }

  let file: File | null = null;
  let folder = "events";
  try {
    const form = await req.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
    const raw = String(form.get("folder") ?? "");
    if (FOLDERS.has(raw)) folder = raw;
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No picture was sent." }, { status: 400 });
  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return NextResponse.json({ error: "That is not a picture we can use. JPEG, PNG, WebP, AVIF or GIF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.` }, { status: 400 });
  }

  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from("images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: "Could not store that picture. Try again." }, { status: 500 });

  return NextResponse.json({ url: db.storage.from("images").getPublicUrl(path).data.publicUrl });
}
