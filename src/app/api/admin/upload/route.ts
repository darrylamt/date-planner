import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * Put an image file in the catalogue and hand back its URL.
 *
 * Every picture in this catalogue has been a URL typed into a box, which works
 * for exactly as long as somebody else keeps hosting the file. A venue that
 * redesigns its website silently removes its photograph from every plan that
 * used it, and a poster for Saturday's event usually exists only as a picture
 * on somebody's phone, which has no URL to type at all.
 *
 * The service role writes, after requireAdmin has checked the caller. There is
 * deliberately no storage RLS policy for insert: a public bucket that
 * authenticated users may write to is a free file host for anybody who can
 * make an account, and the admin gate is the same one every other write in
 * this section already passes.
 */

/** Matches the bucket's own limit, set in migration 0036. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Checked here as well as on the bucket.
 *
 * A limit enforced in one place is a limit right up until somebody writes a
 * second caller, and the failure mode on the other side is a 400 from storage
 * with a message written for a developer rather than for the person who just
 * picked a PDF by mistake.
 */
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/gif", "gif"],
]);

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  let file: File | null = null;
  let folder = "misc";
  try {
    const form = await req.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
    const raw = form.get("folder");
    // Whatever arrives is going into a storage path, so only the characters a
    // path may safely hold survive, and an empty result falls back rather than
    // producing a leading slash or an empty segment.
    if (typeof raw === "string") {
      folder = raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "misc";
    }
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }

  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: "That is not an image we can use. JPEG, PNG, WebP, AVIF or GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`,
      },
      { status: 400 }
    );
  }

  /*
   * Named by chance rather than by the file's own name.
   *
   * Two venues both uploading "photo.jpg" would otherwise collide, and upsert
   * is off precisely so that cannot happen quietly. The original name is not
   * worth keeping: nothing reads it, and it is the one part of the upload a
   * person controls, which makes it the part worth not putting in a path.
   */
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("images")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    // The bucket is created by migration 0036, so its absence is a migration
    // that has not been run rather than anything the caller did wrong.
    const missing = /bucket/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "The images bucket does not exist yet. Run migration 0036."
          : `Upload failed: ${error.message}`,
      },
      { status: missing ? 500 : 400 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("images").getPublicUrl(path);

  return NextResponse.json({ url: publicUrl, path });
}
