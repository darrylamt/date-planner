/** A flyer spec as ?d= for /api/flyer: JSON in base64url, the same in the browser and on the server. */
export function flyerParam(spec: unknown): string {
  const json = JSON.stringify(spec);
  const b64 = typeof window === "undefined" ? Buffer.from(json, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
