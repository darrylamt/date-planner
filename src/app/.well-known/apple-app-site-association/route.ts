import { NextResponse } from "next/server";

/**
 * Universal links (1.2.0): shared venue and Trips links open straight in the
 * app on an iPhone that has it; without it, the page shows (/v, /place).
 */
export function GET() {
  return NextResponse.json(
    { applinks: { details: [{ appIDs: ["26H979HZC3.com.darrylamt.aduro"], components: [{ "/": "/v/*" }, { "/": "/place/*" }] }] } },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
