import { NextResponse } from "next/server";
import { aiCaller, takeRead } from "@/lib/aiAllowance";
import { MENU_READ_TYPES, readMenu, type MenuPart } from "@/lib/menuReader";

/**
 * Read menu photos, a PDF or an untidy spreadsheet into menu rows (menuReader.ts).
 *
 * For admins (Import > Menu items) and venue owners (their Menu page), and it
 * writes nothing: the rows go back to the page, which shows every one before
 * anything is saved. Owners take from a daily share (aiAllowance.ts). Photos are
 * shrunk in the browser first, because a Vercel function takes about 4.5 MB
 * a request; nothing sent here is kept.
 */
export const maxDuration = 60;

const MAX_FILES = 6;
const MAX_BYTES = 4_000_000;

export async function POST(req: Request) {
  const caller = await aiCaller();
  if (!caller || (!caller.admin && !caller.venueIds.length && !caller.staff.includes("menus"))) {
    return NextResponse.json({ error: "Menu reading is for venue accounts and admins." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "Choose at least one photo or file." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Up to ${MAX_FILES} files at a time.` }, { status: 400 });

  const parts: MenuPart[] = [];
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > MAX_BYTES || total > MAX_BYTES) {
      return NextResponse.json({ error: "Those files are too big together. Send fewer pages at a time, or a smaller PDF." }, { status: 413 });
    }
    const mime = f.type.toLowerCase();
    const isText = mime.startsWith("text/") || /\.(csv|tsv|txt)$/i.test(f.name);
    if (isText) {
      parts.push({ text: await f.text(), name: f.name.slice(0, 80) });
    } else if (MENU_READ_TYPES.includes(mime)) {
      parts.push({ mime, data: Buffer.from(await f.arrayBuffer()) });
    } else {
      return NextResponse.json({ error: `Can't read ${f.name}: use photos (JPG, PNG, WebP, HEIC), a PDF, or a CSV.` }, { status: 415 });
    }
  }

  const allowed = await takeRead(caller, "menu");
  if (!allowed.ok) return NextResponse.json({ error: allowed.message, reason: "share" }, { status: 429 });

  const result = await readMenu(parts);
  if (!result.ok) {
    const status = result.reason === "limit" ? 429 : result.reason === "unreadable" ? 422 : 502;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }
  return NextResponse.json(result);
}
